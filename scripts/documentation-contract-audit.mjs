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
  return ts.createSourceFile(
    relativePath,
    read(relativePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
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
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const documented = tableRows
        ? content.includes(`| \`${name}\` |`)
        : new RegExp(`(^|[^A-Za-z0-9_$])${escapedName}([^A-Za-z0-9_$]|$)`, 'm').test(content)
      if (!documented) {
        errors.push(`${relativePath}: ${interfaceName}.${name} is not documented${tableRows ? ' in the field table' : ''}`)
      }
    }
  }
}

function assertNamesDocumented({ names, documents, label }) {
  for (const relativePath of documents) {
    const content = read(relativePath)
    for (const name of names) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const documented = new RegExp(`(^|[^A-Za-z0-9_$])${escapedName}([^A-Za-z0-9_$]|$)`, 'm').test(content)
      if (!documented) errors.push(`${relativePath}: ${label} ${name} is not documented`)
    }
  }
}

function assertTextDocumented({ text, documents, label }) {
  for (const relativePath of documents) {
    if (!read(relativePath).includes(text)) errors.push(`${relativePath}: ${label} is not documented`)
  }
}

function assertTextAbsent({ text, documents, label }) {
  for (const relativePath of documents) {
    if (read(relativePath).includes(text)) errors.push(`${relativePath}: ${label} must not be documented`)
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
    fences: (content.match(/^```/gm) ?? []).length,
  }
}

function assertLocalizedGuideParity() {
  const englishDirectory = 'docs/guide'
  const russianDirectory = 'docs/ru/guide'
  const englishFiles = markdownFiles(englishDirectory)
  const russianFiles = markdownFiles(russianDirectory)
  const vitePressConfig = read('docs/.vitepress/config.ts')

  if (JSON.stringify(englishFiles) !== JSON.stringify(russianFiles)) {
    errors.push(`${englishDirectory} and ${russianDirectory}: localized guide file sets differ`)
    return
  }

  for (const file of englishFiles) {
    const englishPath = `${englishDirectory}/${file}`
    const russianPath = `${russianDirectory}/${file}`
    const route = file.slice(0, -3)
    const english = markdownStructure(englishPath)
    const russian = markdownStructure(russianPath)

    if (!vitePressConfig.includes(`/guide/${route}`)) {
      errors.push(`docs/.vitepress/config.ts: ${englishPath} is missing from navigation`)
    }
    if (!vitePressConfig.includes(`/ru/guide/${route}`)) {
      errors.push(`docs/.vitepress/config.ts: ${russianPath} is missing from navigation`)
    }

    if (english.fences % 2 !== 0) errors.push(`${englishPath}: unclosed fenced code block`)
    if (russian.fences % 2 !== 0) errors.push(`${russianPath}: unclosed fenced code block`)
    if (english.fences !== russian.fences) {
      errors.push(`${englishPath} and ${russianPath}: fenced code block counts differ`)
    }
    if (JSON.stringify(english.headings) !== JSON.stringify(russian.headings)) {
      errors.push(`${englishPath} and ${russianPath}: heading structures differ`)
    }
  }
}

const coreTypes = parseDeclarations('core/types.d.ts')
const rendererTypes = parseDeclarations('renderer/types.d.ts')

assertLocalizedGuideParity()

assertDocumented({
  sourceFile: coreTypes,
  interfaceName: 'EditorConfig',
  documents: ['docs/guide/configuration.md', 'docs/ru/guide/configuration.md'],
  tableRows: true,
})

for (const interfaceName of ['IEditor', 'EditorBlocksApi', 'EditorEventSubscriptions', 'EditorBlockView']) {
  assertDocumented({
    sourceFile: coreTypes,
    interfaceName,
    documents: ['docs/guide/editor-api.md', 'docs/ru/guide/editor-api.md'],
  })
}

assertDocumented({
  sourceFile: coreTypes,
  interfaceName: 'EditorEvents',
  documents: ['docs/guide/editor-api.md', 'docs/ru/guide/editor-api.md'],
  tableRows: true,
})

for (const interfaceName of ['InlineTool', 'InlineMutationContext', 'InlineToolActionContext']) {
  assertDocumented({
    sourceFile: coreTypes,
    interfaceName,
    documents: ['docs/guide/inline-extensions.md', 'docs/ru/guide/inline-extensions.md'],
  })
}

for (const interfaceName of ['InlinePlugin', 'InlinePluginContext']) {
  assertDocumented({
    sourceFile: coreTypes,
    interfaceName,
    documents: ['docs/guide/inline-extensions.md', 'docs/ru/guide/inline-extensions.md'],
  })
}

for (const interfaceName of [
  'BlockPlugin',
  'BlockMutationContext',
  'PluginRuntimeConfig',
  'InlineControlContext',
  'InlineControlGroup',
  'PasteConfig',
  'TagPasteEvent',
  'FilePasteEvent',
  'PatternPasteEvent',
  'ShortcutEntry',
]) {
  assertDocumented({
    sourceFile: coreTypes,
    interfaceName,
    documents: ['docs/guide/extensions.md', 'docs/ru/guide/extensions.md'],
  })
}

for (const interfaceName of ['RendererConfig', 'BlockRenderer', 'InlinePluginLike']) {
  assertDocumented({
    sourceFile: rendererTypes,
    interfaceName,
    documents: ['docs/guide/rendering.md', 'docs/ru/guide/rendering.md'],
  })
}

const editorApiDocuments = ['docs/guide/editor-api.md', 'docs/ru/guide/editor-api.md']
assertNamesDocumented({
  documents: editorApiDocuments,
  label: 'public editor contract',
  names: [
    'EditorDocument', 'BlockData', 'EditorConfig', 'EditorTuning', 'DocumentMigration',
    'EditorDiagnostic', 'EditorDiagnosticCode', 'DiagnosticThresholds', 'BlockValidationIssue',
    'BasePlugin', 'BlockPlugin', 'BlockMutationContext', 'BlockPluginConstructor', 'ToolboxEntry',
    'PluginRuntimeConfig', 'PasteConfig', 'PasteEvent', 'TagPasteEvent', 'FilePasteEvent',
    'PatternPasteEvent', 'ShortcutEntry', 'InlineControlContext', 'InlineControlGroup',
    'InlineTool', 'InlineToolActionContext', 'InlineSelection',
    'InlineMutationContext', 'InlinePlugin', 'InlinePluginContext', 'IInlinePluginRegistry',
    'IEditor', 'EditorBlocksApi', 'EditorBlockView', 'EditorEventSubscriptions', 'EditorEvents',
    'IBlock', 'IBlockReader', 'IBlockManager', 'ISelectionManager', 'IBlockOperations',
    'IEventBus', 'ICrossBlockSelection', 'IScopedI18n', 'LocaleValue', 'PluralForms',
    'I18nMessages', 'MessageKey', 'CaretPosition',
  ],
})
assertTextDocumented({
  documents: editorApiDocuments,
  label: 'advanced type-only entry point',
  text: '@shelamkoff/rector/types',
})

const renderingDocuments = ['docs/guide/rendering.md', 'docs/ru/guide/rendering.md']
assertNamesDocumented({
  documents: renderingDocuments,
  label: 'public renderer contract',
  names: [
    'OutputData', 'OutputBlockData', 'InlineWidget', 'Block', 'BlockType',
    'ParagraphBlock', 'ImageBlock', 'PollBlock', 'ParagraphData', 'ImageData',
    'GalleryData', 'CarouselData', 'PollData', 'PersonData', 'BlockRenderer',
    'InlineParser', 'InlinePluginLike', 'RendererConfig', 'PollDataSource',
    'PollResults', 'PollVoter', 'PollRendererConfig',
  ],
})
assertTextDocumented({
  documents: renderingDocuments,
  label: 'renderer type-only entry point',
  text: '@shelamkoff/rector/renderer/types',
})

const stylingDocuments = ['docs/guide/styling.md', 'docs/ru/guide/styling.md']
assertTextDocumented({
  documents: stylingDocuments,
  label: 'carousel stable root selector',
  text: '.oe-carousel-block',
})
assertTextDocumented({
  documents: stylingDocuments,
  label: 'working host-managed built-in stylesheet example',
  text: 'new Paragraph({',
})
assertTextDocumented({
  documents: stylingDocuments,
  label: 'custom plugin configuration contract',
  text: 'getPluginConfig()',
})
assertTextAbsent({
  documents: stylingDocuments,
  label: 'non-functional custom-plugin configuration example',
  text: 'new Callout({',
})

assertTextDocumented({
  documents: ['docs/guide/configuration.md', 'docs/guide/document-format.md'],
  label: 'precise preserve migration semantics',
  text: 'last structurally valid document',
})
assertTextDocumented({
  documents: ['docs/ru/guide/configuration.md', 'docs/ru/guide/document-format.md'],
  label: 'precise preserve migration semantics',
  text: 'последний достигнутый структурно корректный документ',
})
assertTextDocumented({
  documents: ['docs/guide/rendering.md'],
  label: 'normalized preserve-mode renderer result',
  text: 'normalized safe shape',
})
assertTextDocumented({
  documents: ['docs/ru/guide/rendering.md'],
  label: 'normalized preserve-mode renderer result',
  text: 'нормализованной безопасной формой',
})

const fileSourceDocuments = ['docs/guide/file-sources.md', 'docs/ru/guide/file-sources.md']
for (const text of ['actions', 'uploadFile', 'AbortSignal']) {
  assertTextDocumented({
    documents: fileSourceDocuments,
    label: `file-source contract ${text}`,
    text,
  })
}

if (errors.length > 0) {
  console.error(`Documentation contract audit found ${errors.length} issue(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('Documentation contract audit passed')
}
