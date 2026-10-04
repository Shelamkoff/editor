import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const errors = []

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function parseDeclarations(relativePath) {
  return ts.createSourceFile(relativePath, read(relativePath), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function memberName(member) {
  const name = member.name
  if (!name) return null
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name) && name.expression.getText() === 'Symbol.iterator') return 'Symbol.iterator'
  return null
}

function interfaceMembers(sourceFile, interfaceName) {
  const declaration = sourceFile.statements.find(statement => (
    ts.isInterfaceDeclaration(statement) && statement.name.text === interfaceName
  ))
  if (!declaration) {
    errors.push(`${sourceFile.fileName}: interface ${interfaceName} was not found`)
    return []
  }
  return declaration.members.map(memberName).filter(Boolean)
}

function assertDocumented({ sourceFile, interfaceName, documents, tableRows = false }) {
  const members = interfaceMembers(sourceFile, interfaceName)
  for (const relativePath of documents) {
    const content = read(relativePath)
    for (const name of members) {
      const escapedName = name.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')
      const documented = tableRows
        ? content.includes(`| \`${name}\` |`)
        : new RegExp(`(^|[^A-Za-z0-9_$])${escapedName}([^A-Za-z0-9_$]|$)`, 'm').test(content)
      if (!documented) errors.push(`${relativePath}: ${interfaceName}.${name} is not documented`)
    }
  }
}

function assertNamesDocumented({ names, documents, label }) {
  for (const relativePath of documents) {
    const content = read(relativePath)
    for (const name of names) {
      const escapedName = name.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')
      if (!new RegExp(`(^|[^A-Za-z0-9_$])${escapedName}([^A-Za-z0-9_$]|$)`, 'm').test(content)) {
        errors.push(`${relativePath}: ${label} ${name} is not documented`)
      }
    }
  }
}

function assertTextDocumented({ text, documents, label }) {
  for (const relativePath of documents) if (!read(relativePath).includes(text)) errors.push(`${relativePath}: ${label} is not documented`)
}

function assertPatternAbsent({ pattern, documents, label }) {
  for (const relativePath of documents) {
    if (pattern.test(read(relativePath))) errors.push(`${relativePath}: ${label} must not be documented`)
    pattern.lastIndex = 0
  }
}

function markdownFiles(relativeDirectory) {
  return fs.readdirSync(path.join(root, relativeDirectory), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort()
}

function markdownStructure(relativePath) {
  const content = read(relativePath)
  return {
    headings: [...content.matchAll(/^(#{1,6})\s+\S.*$/gm)].map(match => match[1].length),
    fences: (content.match(/^\`\`\`/gm) ?? []).length,
  }
}

function assertLocalizedGuideParity() {
  const englishFiles = markdownFiles('docs/guide')
  const russianFiles = markdownFiles('docs/ru/guide')
  const vitePressConfig = read('docs/.vitepress/config.ts')
  if (JSON.stringify(englishFiles) !== JSON.stringify(russianFiles)) {
    errors.push('docs/guide and docs/ru/guide: localized guide file sets differ')
    return
  }
  for (const file of englishFiles) {
    const englishPath = `docs/guide/${file}`
    const russianPath = `docs/ru/guide/${file}`
    const route = file.slice(0, -3)
    const english = markdownStructure(englishPath)
    const russian = markdownStructure(russianPath)
    if (!vitePressConfig.includes(`/guide/${route}`)) errors.push(`docs/.vitepress/config.ts: ${englishPath} is missing from navigation`)
    if (!vitePressConfig.includes(`/ru/guide/${route}`)) errors.push(`docs/.vitepress/config.ts: ${russianPath} is missing from navigation`)
    if (english.fences % 2 !== 0) errors.push(`${englishPath}: unclosed fenced code block`)
    if (russian.fences % 2 !== 0) errors.push(`${russianPath}: unclosed fenced code block`)
    if (english.fences !== russian.fences) errors.push(`${englishPath} and ${russianPath}: fenced code block counts differ`)
    if (JSON.stringify(english.headings) !== JSON.stringify(russian.headings)) errors.push(`${englishPath} and ${russianPath}: heading structures differ`)
  }
}

const publicTypes = parseDeclarations('core/publicTypes.d.ts')
const pluginKitTypes = parseDeclarations('plugin-kit/types.d.ts')
const inlineToolTypes = parseDeclarations('inline-tools/types.d.ts')
const rendererTypes = parseDeclarations('renderer/types.d.ts')

assertLocalizedGuideParity()

assertDocumented({
  sourceFile: publicTypes,
  interfaceName: 'EditorConfig',
  documents: ['docs/guide/configuration.md', 'docs/ru/guide/configuration.md'],
  tableRows: true,
})
for (const interfaceName of ['IEditor', 'EditorBlocksApi']) {
  assertDocumented({
    sourceFile: publicTypes,
    interfaceName,
    documents: ['docs/guide/editor-api.md', 'docs/ru/guide/editor-api.md'],
  })
}

for (const interfaceName of ['InlineTool', 'InlineMutationContext', 'InlineToolActionContext']) {
  assertDocumented({
    sourceFile: inlineToolTypes,
    interfaceName,
    documents: ['docs/guide/inline-extensions.md', 'docs/ru/guide/inline-extensions.md'],
  })
}

for (const interfaceName of [
  'BlockPluginDefinition', 'BlockPluginRuntime', 'BlockInstance', 'BlockInstanceContext',
  'BlockDataSchema', 'BlockCapabilities', 'DataTask', 'HtmlImportCapability', 'ClipboardCapability',
  'SettingsActionCapability', 'SettingsPanelCapability',
  'PasteCapability', 'ShortcutCapability', 'SelectionSliceCapability',
]) {
  assertDocumented({
    sourceFile: pluginKitTypes,
    interfaceName,
    documents: ['docs/guide/extensions.md', 'docs/ru/guide/extensions.md'],
  })
}

for (const interfaceName of [
  'InlinePluginDefinition', 'InlinePluginRuntimeContext', 'InlinePluginRuntime',
  'InlineWidgetContext', 'InlineWidgetInstance',
]) {
  assertDocumented({
    sourceFile: pluginKitTypes,
    interfaceName,
    documents: ['docs/guide/inline-extensions.md', 'docs/ru/guide/inline-extensions.md'],
  })
}

for (const interfaceName of ['RendererConfig', 'BlockRenderer', 'BlockRendererDefinition', 'InlineWidgetRenderer']) {
  assertDocumented({
    sourceFile: rendererTypes,
    interfaceName,
    documents: ['docs/guide/rendering.md', 'docs/ru/guide/rendering.md'],
  })
}

assertNamesDocumented({
  documents: ['docs/guide/editor-api.md', 'docs/ru/guide/editor-api.md'],
  label: 'public editor contract',
  names: [
    'EditorDocument', 'EditorBlockSnapshot', 'EditorBlocksApi', 'EditorEventName', 'IEditor',
  ],
})
assertTextDocumented({
  documents: ['docs/guide/editor-api.md', 'docs/ru/guide/editor-api.md'],
  label: 'advanced type-only entry point',
  text: '@shelamkoff/rector/types',
})

const publicGuideDocuments = [
  'docs/guide/configuration.md', 'docs/ru/guide/configuration.md',
  'docs/guide/editor-api.md', 'docs/ru/guide/editor-api.md',
  'docs/guide/extensions.md', 'docs/ru/guide/extensions.md',
  'docs/guide/inline-extensions.md', 'docs/ru/guide/inline-extensions.md',
  'docs/guide/styling.md', 'docs/ru/guide/styling.md',
]
for (const [pattern, label] of [
  [/\bBlockPlugin\b/g, 'legacy BlockPlugin contract'],
  [/\bInlinePlugin\b/g, 'legacy InlinePlugin contract'],
  [/\bBlockMutationContext\b/g, 'legacy block mutation context'],
  [/\bBlockPluginAbstract\b/g, 'legacy plugin base class'],
  [/\bgetPluginConfig\b/g, 'legacy plugin configuration method'],
  [/\brootElement\b/g, 'legacy public DOM handle'],
  [/\bgetBlockByIndex\b/g, 'legacy block-view API'],
  [/new\s+(?:Paragraph|Heading|Quote|List|Image|Gallery|CarouselBlock|Attaches|Poll|Person)\s*\(/g, 'legacy class construction'],
]) {
  assertPatternAbsent({ pattern, documents: publicGuideDocuments, label })
}

if (errors.length) {
  console.error(`Documentation contract audit found ${errors.length} issue(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('Documentation contract audit passed')
}
