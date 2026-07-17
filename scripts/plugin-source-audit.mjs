import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const errors = []

function sourceFilesUnder(relativeDirectory) {
  const result = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'locale') visit(file)
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
        result.push(file)
      }
    }
  }
  visit(path.join(root, relativeDirectory))
  return result
}

function auditedSourceFiles() {
  return [...new Set([
    ...sourceFilesUnder('plugins'),
    ...sourceFilesUnder('inline-tools'),
    ...sourceFilesUnder('inline-plugins'),
    ...sourceFilesUnder(path.join('renderer', 'renderers')),
  ])]
}

function leadingJSDoc(node, sourceFile) {
  const leading = sourceFile.text.slice(node.getFullStart(), node.getStart(sourceFile))
  const matches = [...leading.matchAll(/\/\*\*[\s\S]*?\*\//g)]
  const last = matches.at(-1)
  if (!last) return ''

  const trailing = leading.slice((last.index || 0) + last[0].length)
  return /^\s*$/.test(trailing) ? last[0].trim() : ''
}

function hasDescription(comment) {
  return comment
    .replace(/^\/\*\*|\*\/$/g, '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*\*\s?/, '').trim())
    .some(line => line && !line.startsWith('@'))
}

function nodeName(node) {
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  return node.name?.getText() || '<anonymous>'
}

function checkCallable(node, sourceFile, label, { requireDescription = false } = {}) {
  const comment = leadingJSDoc(node, sourceFile)
  if (!comment) {
    errors.push(`${label}: missing JSDoc`)
    return
  }

  if (requireDescription && !hasDescription(comment)) {
    errors.push(`${label}: JSDoc has no consumer-facing description`)
  }

  for (const parameter of node.parameters || []) {
    const name = parameter.name.getText()
    if (ts.getJSDocParameterTags(parameter).length === 0) {
      errors.push(`${label}: parameter \`${name}\` is not documented`)
    }
  }

  if (!ts.isConstructorDeclaration(node) && !ts.getJSDocReturnTag(node)) {
    errors.push(`${label}: return value is not documented`)
  }
}

function inspect(file) {
  const relative = path.relative(root, file).replaceAll('\\', '/')
  const source = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const packageEntry = path.basename(file) === 'index.js'
    || relative.startsWith('inline-tools/')
    || relative === 'inline-plugins/color.js'
    || relative === 'plugins/async.js'
    || relative === 'renderer/renderers/async.js'

  if (packageEntry) {
    const inspectTypedefs = node => {
      for (const doc of node.jsDoc || []) {
        for (const tag of doc.tags || []) {
          if (!ts.isJSDocTypedefTag(tag)) continue
          const typedefName = tag.name?.getText(sourceFile) || '<anonymous>'
          for (const property of tag.typeExpression?.jsDocPropertyTags || []) {
            if (!String(property.comment || '').trim()) {
              errors.push(`${relative}:${property.getStart(sourceFile)} ${typedefName}.${property.name.getText(sourceFile)}: public JSDoc property has no consumer-facing description`)
            }
          }
        }
      }
      ts.forEachChild(node, inspectTypedefs)
    }
    inspectTypedefs(sourceFile)
  }

  for (const statement of sourceFile.statements) {
    const exported = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)

    if (exported && ts.isFunctionDeclaration(statement)) {
      checkCallable(statement, sourceFile, `${relative}:${statement.getStart(sourceFile)} ${statement.name?.text || '<anonymous>'}`, {
        requireDescription: true,
      })
    }

    if (packageEntry && exported && ts.isVariableStatement(statement)) {
      const comment = leadingJSDoc(statement, sourceFile)
      for (const declaration of statement.declarationList.declarations) {
        const label = `${relative}:${declaration.getStart(sourceFile)} ${declaration.name.getText()}`
        if (!comment) errors.push(`${label}: exported value is missing JSDoc`)
        else if (!hasDescription(comment)) errors.push(`${label}: exported value JSDoc has no consumer-facing description`)
      }
    }

    if (!exported || !ts.isClassDeclaration(statement)) continue

    const comment = leadingJSDoc(statement, sourceFile)
    const label = `${relative}:${statement.getStart(sourceFile)} ${statement.name?.text || '<anonymous>'}`
    if (!comment) errors.push(`${label}: exported class is missing JSDoc`)
    else if (!hasDescription(comment)) errors.push(`${label}: exported class JSDoc has no consumer-facing description`)

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member)
        && !ts.isGetAccessorDeclaration(member)
        && !ts.isSetAccessorDeclaration(member)
        && !ts.isConstructorDeclaration(member)) continue

      const memberName = nodeName(member)
      const consumerFacingMember = packageEntry
        && (!member.name || !ts.isPrivateIdentifier(member.name))
        && !memberName.startsWith('_')
      checkCallable(
        member,
        sourceFile,
        `${relative}:${member.getStart(sourceFile)} ${statement.name?.text || '<anonymous>'}.${nodeName(member)}`,
        { requireDescription: consumerFacingMember },
      )
    }
  }
}

for (const file of auditedSourceFiles()) inspect(file)

if (errors.length > 0) {
  console.error(`Plugin source audit found ${errors.length} issue(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('Plugin source audit passed')
}
