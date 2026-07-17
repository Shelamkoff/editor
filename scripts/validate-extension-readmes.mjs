import { access, readFile, readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

const collections = [
  { directory: 'plugins', expected: 22 },
  { directory: 'inline-plugins', expected: 3 },
  { directory: 'renderer/renderers', expected: 22 },
]

async function collectReadmeDirectories(relativeDirectory) {
  const directory = join(root, relativeDirectory)
  const entries = await readdir(directory, { withFileTypes: true })
  return [
    directory,
    ...entries
      .filter(entry => entry.isDirectory())
      .map(entry => join(directory, entry.name)),
  ]
}

const blockSections = {
  english: [
    '## Install and register',
    '## Data',
    '## Configuration',
    '## Capabilities',
    '## Undo, lifecycle, and styles',
    '## Document output',
  ],
  russian: [
    '## Установка и регистрация',
    '## Данные',
    '## Конфигурация',
    '## Возможности',
    '## История, жизненный цикл и стили',
    '## Вывод документа',
  ],
}

const rendererSections = {
  english: ['## Usage', '## Typical data'],
  russian: ['## Использование', '## Типичные данные'],
}

async function documentedPluginConfigKeys(directory) {
  const sourcePath = join(directory, 'index.js')
  const source = await readFile(sourcePath, 'utf8')
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const keys = new Set(['injectStyles', 'css'])

  function visit(node) {
    for (const doc of node.jsDoc || []) {
      for (const tag of doc.tags || []) {
        if (!ts.isJSDocTypedefTag(tag) || !tag.name?.getText(sourceFile).endsWith('Config')) continue
        for (const property of tag.typeExpression?.jsDocPropertyTags || []) {
          keys.add(property.name.getText(sourceFile))
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...keys]
}

function requireDocumentedSymbols(directory, files, symbols) {
  for (const symbol of symbols) {
    for (const [file, content] of files) {
      if (!content.includes(`\`${symbol}\``)) {
        throw new Error(`${file}: public option or export \`${symbol}\` is not documented`)
      }
    }
  }
}

function requireSections(file, content, sections) {
  for (const section of sections) {
    if (!content.includes(section)) throw new Error(`${file}: missing required section "${section}"`)
  }
}

function headingLevels(content) {
  return [...content.matchAll(/^(#{1,6})\s+\S.*$/gm)].map(match => match[1].length)
}

function codeFenceLanguages(content) {
  const languages = []
  let open = false
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^```([^\s`]*)\s*$/)
    if (!match) continue
    if (!open) languages.push(match[1] || '')
    open = !open
  }
  if (open) throw new Error('unclosed fenced code block')
  return languages
}

function tableShapes(content) {
  const lines = content.split(/\r?\n/)
  const shapes = []
  for (let index = 1; index < lines.length; index++) {
    if (!/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[index])) continue
    let end = index + 1
    while (end < lines.length && lines[end].includes('|') && lines[end].trim()) end++
    const columns = lines[index].split('|').filter(cell => cell.trim()).length
    shapes.push({ columns, rows: end - index })
    index = end - 1
  }
  return shapes
}

function sameStructure(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateLocaleStructure(directory, englishFile, english, russianFile, russian) {
  const englishHeadings = headingLevels(english)
  const russianHeadings = headingLevels(russian)
  if (!sameStructure(englishHeadings, russianHeadings)) {
    throw new Error(`${directory}: EN/RU heading hierarchy differs (${englishFile} vs ${russianFile})`)
  }

  let englishFences
  let russianFences
  try {
    englishFences = codeFenceLanguages(english)
    russianFences = codeFenceLanguages(russian)
  } catch (error) {
    throw new Error(`${directory}: ${error.message}`)
  }
  if (!sameStructure(englishFences, russianFences)) {
    throw new Error(`${directory}: EN/RU fenced examples differ in count or language`)
  }

  const englishTables = tableShapes(english)
  const russianTables = tableShapes(russian)
  if (!sameStructure(englishTables, russianTables)) {
    throw new Error(`${directory}: EN/RU table shapes differ`)
  }
}

async function validateConsumerCoverage(relativeCollection, directory) {
  if (directory === join(root, relativeCollection)) return
  const englishFile = join(directory, 'README.md')
  const russianFile = join(directory, 'README.ru.md')
  const [english, russian] = await Promise.all([
    readFile(englishFile, 'utf8'),
    readFile(russianFile, 'utf8'),
  ])
  validateLocaleStructure(directory, englishFile, english, russianFile, russian)

  if (relativeCollection === 'plugins') {
    const pluginName = basename(directory)
    requireSections(englishFile, english, blockSections.english)
    requireSections(russianFile, russian, blockSections.russian)
    requireDocumentedSymbols(
      directory,
      [[englishFile, english], [russianFile, russian]],
      await documentedPluginConfigKeys(directory),
    )
    if (pluginName === 'delimiter') {
      if (!english.includes('no configurable data fields')) throw new Error(`${englishFile}: missing explicit empty data contract`)
      if (!russian.includes('Настраиваемых полей данных нет')) throw new Error(`${russianFile}: missing explicit empty data contract`)
    } else {
      requireSections(englishFile, english, ['### Field reference'])
      requireSections(russianFile, russian, ['### Поля данных'])
    }
    if (pluginName === 'heading') {
      if (!english.includes('HEADING_LEVELS') || !russian.includes('HEADING_LEVELS')) {
        throw new Error(`${directory}: the public HEADING_LEVELS export is not documented in both locales`)
      }
    }
    if (pluginName === 'carousel') {
      if (!english.includes('`Carousel`') || !russian.includes('`Carousel`')) {
        throw new Error(`${directory}: the public Carousel alias is not documented in both locales`)
      }
    }
  }

  if (relativeCollection === 'inline-plugins') {
    const englishHeadings = [...english.matchAll(/^## .+$/gm)].map(match => match[0])
    const russianHeadings = [...russian.matchAll(/^## .+$/gm)].map(match => match[0])
    if (englishHeadings.length < 5 || russianHeadings.length < 5) {
      throw new Error(`${directory}: inline plugin README must document registration, data, behavior, lifecycle/styles, and output`)
    }
    for (const [file, content, patterns] of [
      [englishFile, english, [/^## .*register/im, /^## .*data/im, /^## .*history/im, /^## .*output/im]],
      [russianFile, russian, [/^## .*регистрац/im, /^## .*данн/im, /^## .*истори/im, /^## .*отображ/im]],
    ]) {
      for (const pattern of patterns) {
        if (!pattern.test(content)) throw new Error(`${file}: missing consumer topic ${pattern}`)
      }
    }
    if (basename(directory) === 'mention') {
      requireDocumentedSymbols(directory, [[englishFile, english], [russianFile, russian]], [
        'createMentionPlugin',
        'createMentionWidget',
        'trigger',
        'searchFunction',
        'debounceDelay',
        'noResultsText',
        'dropdownClass',
        'onMentionSelect',
        'renderItem',
        'renderNoResults',
        'renderLoading',
      ])
    }
  }

  if (relativeCollection === 'renderer/renderers') {
    requireSections(englishFile, english, rendererSections.english)
    requireSections(russianFile, russian, rendererSections.russian)
    if (!english.includes('renderer.destroy()') || !english.includes('rendererStyles.destroy()')) {
      throw new Error(`${englishFile}: renderer ownership and cleanup are not documented`)
    }
    if (!russian.includes('renderer.destroy()') || !russian.includes('rendererStyles.destroy()')) {
      throw new Error(`${russianFile}: renderer ownership and cleanup are not documented`)
    }
    if (!english.includes('blockTypes: []') || !russian.includes('blockTypes: []')) {
      throw new Error(`${directory}: direct renderer registration is not explained in both locales`)
    }
    if (basename(directory) === 'attaches') {
      for (const symbol of ['ARCHIVE_LIMITS', 'sanitizeArchiveFilename', 'downloadArchive']) {
        if (!english.includes(symbol) || !russian.includes(symbol)) {
          throw new Error(`${directory}: the public ${symbol} export is not documented in both locales`)
        }
      }
    }
  }
}

let pairs = 0
for (const collection of collections) {
  const directories = await collectReadmeDirectories(collection.directory)
  const localized = []
  for (const directory of directories) {
    try {
      await Promise.all([
        access(join(directory, 'README.md')),
        access(join(directory, 'README.ru.md')),
      ])
      localized.push(directory)
      await validateConsumerCoverage(collection.directory, directory)
    } catch {
      // Runtime-only directories are allowed, but a README is always a pair.
      const hasEnglish = await access(join(directory, 'README.md')).then(() => true, () => false)
      const hasRussian = await access(join(directory, 'README.ru.md')).then(() => true, () => false)
      if (hasEnglish !== hasRussian) {
        throw new Error(`${directory}: localized README pair is incomplete`)
      }
    }
  }
  if (localized.length !== collection.expected) {
    throw new Error(`${collection.directory}: expected ${collection.expected} localized README pairs, got ${localized.length}`)
  }
  pairs += localized.length
}

// README files are authoritative localized sources. VitePress pages are built
// from them by sync-vitepress-readmes.mjs; this gate prevents one locale from
// being silently regenerated while the other is left stale.
console.log(JSON.stringify({ localizedReadmePairs: pairs }))
