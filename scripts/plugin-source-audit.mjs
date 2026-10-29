import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const errors = []

function sourceFilesUnder(relativeDirectory, { includeLocale = false, includeTypes = false } = {}) {
  const result = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (includeLocale || entry.name !== 'locale') visit(file)
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')
        || includeTypes && entry.name.endsWith('.d.ts')) {
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

/** Inspect runtime and type/JSDoc directions; only executable edges form cycles. */
export function auditRuntimeDependencies(sources) {
  const failures = []
  const graph = new Map()
  const preparations = new Set(['DocumentIngestion.js', 'CanonicalTransforms.js', 'projectionFields.js',
    'LogicalRangePlans.js', 'ClipboardPlans.js', 'SelectionConversionPlans.js', 'ClipboardFragment.js'])
  const owner = file => file.startsWith('core/')
    ? preparations.has(path.posix.basename(file).replace(/\.d\.ts$/, '.js')) ? 'preparation' : 'editor'
    : /^(plugins|inline-plugins|inline-tools)\//.test(file) ? 'extension'
      : file.startsWith('shared/') ? 'shared' : file.startsWith('plugin-kit/') ? 'kit'
        : file.startsWith('renderer/') ? 'renderer' : 'editor'
  const resolve = (from, specifier, kind) => {
    const clean = specifier.split(/[?#]/)[0]
    let target
    if (clean.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(from), clean))
    else if (clean === manifest.name || clean.startsWith(manifest.name + '/')) {
      const route = clean === manifest.name ? '.' : '.' + clean.slice(manifest.name.length)
      let entry = manifest.exports[route], replacement
      if (!entry) {
        const pattern = Object.keys(manifest.exports)
          .filter(key => key.includes('*') && route.startsWith(key.split('*')[0]) && route.endsWith(key.split('*')[1]))
          .sort((left, right) => right.indexOf('*') - left.indexOf('*') || right.length - left.length)[0]
        if (pattern) {
          const [prefix, suffix] = pattern.split('*')
          replacement = route.slice(prefix.length, suffix ? -suffix.length : undefined)
          entry = manifest.exports[pattern]
        }
      }
      if (!entry) return { error: `unpublished self-package dependency ${clean}` }
      const published = typeof entry === 'string' ? entry : kind === 'type' ? entry.types ?? entry.import : entry.import
      if (!published) return { error: `no ${kind} export for self-package dependency ${clean}` }
      // Generated package declarations share source owners. A generated .d.ts
      // entry can therefore resolve to its checked JSDoc source before build.
      target = published.replace(/^\.\/(?:dist\/)?/, '')
      if (replacement !== undefined) target = target.replaceAll('*', replacement)
    }
    else return null
    const candidates = kind === 'type'
      ? /\.[cm]?js$/.test(target)
        ? [target.replace(/\.([cm]?)js$/, '.d.$1ts'), target]
        : /\.d\.[cm]?ts$/.test(target)
          ? [target, target.replace(/\.d\.([cm]?)ts$/, '.$1js')]
          : [target, target + '.d.ts', target + '.js', target + '/index.d.ts', target + '/index.js']
      : [target, target + '.js', target + '/index.js'].filter(candidate => !candidate.endsWith('.d.ts'))
    const resolved = candidates.find(candidate => sources.has(candidate))
    if (resolved) return { target: resolved }
    // A self-package or relative runtime import must resolve, including
    // extensionless paths. Non-JavaScript assets (CSS, JSON, etc.) are not
    // runtime modules in this graph and remain outside its audit.
    return !path.posix.extname(target) || /\.[cm]?js$|\.d\.[cm]?ts$/.test(target) ? { target } : null
  }
  for (const [file, text] of sources) {
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS)
    const edges = new Set()
    const inspectEdge = node => {
      let literal
      let kind = ast.isDeclarationFile ? 'type' : 'runtime'
      if (ts.isImportDeclaration(node)) {
        literal = node.moduleSpecifier
        const clause = node.importClause, named = clause?.namedBindings
        if (clause?.isTypeOnly || !clause?.name && named && ts.isNamedImports(named)
          && named.elements.length > 0 && named.elements.every(element => element.isTypeOnly)) kind = 'type'
      } else if (ts.isExportDeclaration(node)) {
        literal = node.moduleSpecifier
        if (node.isTypeOnly || node.exportClause && ts.isNamedExports(node.exportClause)
          && node.exportClause.elements.length > 0 && node.exportClause.elements.every(element => element.isTypeOnly)) kind = 'type'
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        literal = node.moduleReference.expression
        if (node.isTypeOnly) kind = 'type'
      } else if (ts.isImportTypeNode(node)) {
        literal = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null
        kind = 'type'
      } else if (ts.isJSDocImportTag(node)) {
        literal = node.moduleSpecifier
        kind = 'type'
      }
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) literal = node.arguments[0]
      if (literal && ts.isStringLiteralLike(literal)) {
        const resolved = resolve(file, literal.text, kind)
        const line = ast.getLineAndCharacterOfPosition(literal.getStart(ast)).line + 1
        if (resolved?.error) failures.push(`${file}:${line}: ${resolved.error}`)
        const target = resolved?.target
        if (target) {
          const sourceOwner = owner(file), targetOwner = owner(target)
          const forbidden = sourceOwner === 'extension' && target.startsWith('core/')
            || sourceOwner === 'renderer' && !['renderer','shared','kit'].includes(targetOwner)
            || (sourceOwner === 'shared' || sourceOwner === 'kit') && !['shared', 'kit'].includes(targetOwner)
            || sourceOwner === 'preparation' && !['shared', 'kit', 'preparation'].includes(targetOwner)
            || kind === 'type' && targetOwner === 'renderer'
              && (file.startsWith('core/') || /^plugins\/async\.(?:js|d\.ts)$/.test(file))
          if (forbidden) failures.push(`${file}:${line}: forbidden ${sourceOwner}${kind === 'type' ? ' type' : ''} dependency on ${target}`)
          if (!sources.has(target) || kind === 'runtime' && target.endsWith('.d.ts')) failures.push(`${file}:${line}: unresolved ${kind} dependency ${target}`)
          else if (kind === 'runtime') edges.add(target)
        }
      }
      for (const doc of node.jsDoc ?? []) inspectEdge(doc)
      ts.forEachChild(node, inspectEdge)
    }
    inspectEdge(ast)
    graph.set(file, edges)
  }
  const active = new Set(), complete = new Set(), stack = []
  const visit = file => {
    if (active.has(file)) {
      failures.push('Runtime dependency cycle: ' + [...stack.slice(stack.indexOf(file)), file].join(' -> '))
      return
    }
    if (complete.has(file)) return
    active.add(file)
    stack.push(file)
    for (const target of graph.get(file) ?? []) visit(target)
    stack.pop()
    active.delete(file)
    complete.add(file)
  }
  for (const file of graph.keys()) visit(file)
  return failures
}


const removedLegacyFiles = [
  'shared/blockDataValidators.js',
  'shared/blockDataNormalizers.js',
  'shared/mapTextFields.js',
]
for (const relative of removedLegacyFiles) {
  if (fs.existsSync(path.join(root, relative))) {
    errors.push(`${relative}: removed legacy schema helper must not return`)
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (Object.hasOwn(manifest.exports ?? {}, './core')) {
  errors.push('package.json: duplicate legacy ./core package export must not return')
}

const pluginKitSource = fs.readFileSync(path.join(root, 'plugin-kit', 'index.js'), 'utf8')
for (const unsafeSink of ['setTrustedHtml', 'insertTrustedHtml']) {
  if (pluginKitSource.includes(unsafeSink)) {
    errors.push(`plugin-kit/index.js: unsafe trusted sink ${unsafeSink} must remain internal`)
  }
}

const removedRuntimeSymbols = [
  'UNDO_BATCH_START',
  'UNDO_BATCH_END',
  'configureCommandActivity',
  'configureCommit',
  'configureRollback',
  'setCommandDispatcher',
  'BlockPluginAbstract',
  'PublicBlockView',
  'TEXT_ALIGN_TUNE_ATTRIBUTE',
  'createEditorV2',
  'PublicEditorApiV2',
  'SelectionControllerV2',
  'SlashCommandControllerV2',
  'ClipboardControllerV2',
  'BlockToolbarV2',
  'DragControllerV2',
  'InlineToolbarV2',
  'notifyChanged',
  'splitRichTextField(',
  'replaceBlock(',
  'insertExternalBlocks(',
  'exportRichTextFragment(',
  'replaceRichTextFragment(',
  'CrossEditableSelectionPort',
  'SavedOffsets',
  'saveCrossBlockOffsets(',
  'restoreCrossBlockRange(',
  'saveSelectionOffsets(',
  'restoreSelectionOffsets(',
  'clearCrossBlockRange(',
  'getSelectedBlockElements(',
  'showCrossHighlight(',
  'hideCrossHighlight(',
  'rootElement',
  'contentElement',
  'getData(element)',
  'hydrate(element',
  'ParagraphData.align',
  'HeadingData.align',
]
const removedSymbolSources = sourceFilesUnder('core')
  .concat(sourceFilesUnder('plugins'), sourceFilesUnder('inline-plugins'), sourceFilesUnder('inline-tools'))
for (const symbol of removedRuntimeSymbols) {
  for (const file of removedSymbolSources) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    const source = fs.readFileSync(file, 'utf8')
    if (source.includes(symbol)) {
      errors.push(`${relative}: removed runtime symbol \`${symbol}\` must not return`)
    }
  }
}

for (const file of auditedSourceFiles()) inspect(file)
const dependencySources = new Map(['core', 'plugins', 'inline-plugins', 'inline-tools', 'plugin-kit', 'renderer', 'shared', 'locale', 'preset']
  .flatMap(directory => sourceFilesUnder(directory, { includeLocale: true, includeTypes: true }))
  .map(file => [path.relative(root, file).replaceAll('\\', '/'), fs.readFileSync(file, 'utf8')]))
for (const entry of ['index.js', 'index.d.ts', 'types.d.ts', 'I18n.d.ts']) {
  dependencySources.set(entry, fs.readFileSync(path.join(root, entry), 'utf8'))
}
errors.push(...auditRuntimeDependencies(dependencySources))

if (errors.length > 0) {
  console.error(`Plugin source audit found ${errors.length} issue(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('Plugin source audit passed')
}
