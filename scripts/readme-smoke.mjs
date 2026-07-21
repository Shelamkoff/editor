import { access, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { loadBlockPlugin } from '../plugins/async.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workspace = resolve(root, '..')

const blockPaths = [
  'paragraph', 'heading', 'list', 'quote', 'code', 'image', 'delimiter', 'table',
  'checklist', 'warning', 'embed', 'raw', 'gallery', 'carousel', 'attaches', 'link-preview',
  'toggle', 'columns', 'spoiler', 'poll', 'person',
]

const readmes = [
  join(root, 'plugins', 'README.md'),
  ...blockPaths.map(path => join(root, 'plugins', path, 'README.md')),
  join(root, 'inline-plugins', 'README.md'),
  join(root, 'inline-plugins', 'color', 'README.md'),
  join(root, 'inline-plugins', 'mention', 'README.md'),
  join(root, 'renderer', 'renderers', 'README.md'),
  ...blockPaths.map(path => join(root, 'renderer', 'renderers', path, 'README.md')),
]
const russianReadmes = readmes.map(file => file.replace(/README\.md$/, 'README.ru.md'))
const allReadmes = [...readmes, ...russianReadmes]

if (readmes.length !== 47) throw new Error(`Expected 47 Rector extension reference files, got ${readmes.length}`)
if (allReadmes.length !== 94) throw new Error(`Expected 94 localized Rector extension reference files, got ${allReadmes.length}`)

const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const colorPickerManifest = JSON.parse(await readFile(join(workspace, 'color-picker', 'package.json'), 'utf8'))

function isExportedBy(packageManifest, specifier) {
  if (specifier === packageManifest.name) return true
  const subpath = `.${specifier.slice(packageManifest.name.length)}`
  return Object.keys(packageManifest.exports).some(key => {
    if (!key.includes('*')) return key === subpath
    const [start, end] = key.split('*')
    return subpath.startsWith(start) && subpath.endsWith(end)
  })
}

function isExported(specifier) { return isExportedBy(manifest, specifier) }

function sourceModuleFor(specifier) {
  const subpath = specifier.slice(manifest.name.length)
  if (!subpath) return join(root, 'index.js')
  if (subpath === '/core') return join(root, 'core', 'index.js')
  if (subpath === '/plugins') return join(root, 'plugins', 'index.js')
  if (subpath === '/plugins/async') return join(root, 'plugins', 'async.js')
  if (subpath.startsWith('/plugins/')) return join(root, subpath, 'index.js')
  if (subpath === '/inline-plugins/color') return join(root, 'inline-plugins', 'color.js')
  if (subpath === '/inline-plugins/mention') return join(root, 'inline-plugins', 'mention', 'index.js')
  if (subpath === '/inline-tools') return join(root, 'inline-tools', 'defaults.js')
  if (subpath.startsWith('/inline-tools/')) return join(root, `${subpath}.js`)
  if (subpath === '/renderer') return join(root, 'renderer', 'index.js')
  if (subpath === '/renderer/async') return join(root, 'renderer', 'async.js')
  if (subpath === '/renderer/renderers') return join(root, 'renderer', 'renderers', 'index.js')
  if (subpath === '/renderer/renderers/async') return join(root, 'renderer', 'renderers', 'async.js')
  if (subpath.startsWith('/renderer/renderers/')) return join(root, subpath, 'index.js')
  return null
}

const moduleCache = new Map()
let exampleCount = 0
let jsonCount = 0
let linkCount = 0
const jsonShapesByFile = new Map()
const jsonValuesByFile = new Map()

function jsonShape(value) {
  if (Array.isArray(value)) {
    const itemShapes = [...new Set(value.map(item => JSON.stringify(jsonShape(item))))].sort()
    return { type: 'array', items: itemShapes }
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, jsonShape(value[key])]),
    )
  }
  return value === null ? 'null' : typeof value
}

function proseOnly(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')
    .replace(/\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
}

const forbiddenRussianProse = [
  'command dispatcher', 'reference count', 'cleanup hook', 'package entries',
  'optional peer', 'undo/redo', 'lifecycle', 'security', 'validation',
  'authoring', 'diagnostics', 'cleanup', 'shortcuts', 'merge', 'markup',
  'paste', 'toolbox', 'settings', 'factory', 'preset', 'holder', 'renderer',
  'layout', 'viewer', 'uploader', 'metadata', 'preview', 'callback', 'handler',
  'mounting', 'host', 'sandboxed', 'persistence', 'transport', 'boolean',
  'fenced code', 'inline', 'stylesheet', 'prompt', 'cover', 'listeners',
]

const allowedRussianLatin = new Set([
  'rector', 'vitepress', 'dom', 'html', 'css', 'url', 'json', 'esm', 'http',
  'https', 'mime', 'api', 'svg', 'npm', 'node.js', 'highlight.js', 'youtube',
  'vimeo', 'abortsignal', 'paragraph', 'heading', 'list', 'quote', 'code',
  'image', 'delimiter', 'table', 'checklist', 'warning', 'embed', 'raw',
  'gallery', 'carousel', 'carouselblock', 'attaches', 'linkpreview', 'toggle', 'columns', 'spoiler', 'poll',
  'person',
])

const untranslatedRussianExampleValues = [
  'Hello', 'world', 'Section', 'One', 'Two', 'Quote', 'Author', 'Caption',
  'Name', 'Value', 'Ship', 'Note', 'Important details', 'Content', 'Cover',
  'Opening slide', 'Video', 'Sanitized HTML', 'Example', 'Details',
  'Hidden text', 'Left', 'Right', 'Reveal', 'Spoiler text', 'Stable', 'Next',
]

for (const file of allReadmes) {
  const markdown = await readFile(file, 'utf8')
  const label = relative(workspace, file)
  const isRussian = file.endsWith('README.ru.md')
  if (!markdown.startsWith('# ')) throw new Error(`${label}: missing H1`)
  if (isRussian && !/[А-Яа-яЁё]/u.test(markdown)) throw new Error(`${label}: Russian translation has no Cyrillic text`)
  if (/\uFFFD|(?:Рџ|РЎ|Рµ|Р°|РЅ|СЃ|С‚|вЂ)/u.test(markdown)) {
    throw new Error(`${label}: contains mojibake or replacement characters`)
  }

  if (isRussian) {
    const prose = proseOnly(markdown).toLowerCase()
    const leaked = forbiddenRussianProse.find(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(prose))
    if (leaked) throw new Error(`${label}: translatable English prose remains: ${leaked}`)
    const latinWords = [...new Set(
      [...prose.matchAll(/[a-z][a-z0-9+]*(?:\.[a-z]+)?/g)]
        .map(match => match[0])
        .filter(word => !allowedRussianLatin.has(word)),
    )]
    if (latinWords.length) throw new Error(`${label}: unexplained Latin prose remains: ${latinWords.join(', ')}`)
    const untranslatedValue = untranslatedRussianExampleValues.find(value => markdown.includes(`"${value}"`))
    if (untranslatedValue) throw new Error(`${label}: untranslated example value remains: ${untranslatedValue}`)
  }

  const sourceRelative = relative(root, file).replaceAll('\\', '/')
  if (/^(?:plugins|inline-plugins)\/[^/]+\/README(?:\.ru)?\.md$/.test(sourceRelative)
    && markdown.includes("import '@shelamkoff/rector/styles/editor.css'")) {
    throw new Error(`${label}: default automatic style mode must not duplicate the editor stylesheet import`)
  }
  if (/^renderer\/renderers\/[^/]+\/README(?:\.ru)?\.md$/.test(sourceRelative)) {
    if (!markdown.includes('renderer.injectStyles()') || !markdown.includes('rendererStyles.destroy()')) {
      throw new Error(`${label}: renderer example has an asymmetric stylesheet lifecycle`)
    }
  }
  if (/^inline-plugins\/color\/README(?:\.ru)?\.md$/.test(sourceRelative)
    && markdown.includes("@shelamkoff/color-picker/styles.css")) {
    throw new Error(`${label}: color widget example must rely on Rector's style registry`)
  }

  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].trim()
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue
    const fileTarget = target.split(/[?#]/, 1)[0]
    const absolute = resolve(dirname(file), fileTarget)
    const fallback = fileTarget.startsWith('./dist/')
      ? resolve(dirname(file), fileTarget.replace('./dist/', './'))
      : null
    try {
      await access(absolute)
    } catch {
      if (!fallback) throw new Error(`${label}: broken relative link ${target}`)
      await access(fallback).catch(() => { throw new Error(`${label}: broken package/source link ${target}`) })
    }
    linkCount += 1
  }

  for (const match of markdown.matchAll(/```(js|javascript|ts|typescript)\s*\r?\n([\s\S]*?)```/g)) {
    const loader = match[1].startsWith('ts') ? 'ts' : 'js'
    const result = ts.transpileModule(match[2], {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        allowJs: loader === 'js',
      },
      fileName: `example.${loader}`,
      reportDiagnostics: true,
    })
    const errors = (result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    if (errors.length) {
      const detail = errors.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('; ')
      throw new Error(`${label}: invalid ${loader} example: ${detail}`)
    }
    if (!isRussian) exampleCount += 1
  }

  for (const match of markdown.matchAll(/```json\s*\r?\n([\s\S]*?)```/g)) {
    let parsed
    try { parsed = JSON.parse(match[1]) } catch (error) {
      throw new Error(`${label}: invalid JSON example: ${error.message}`)
    }
    const shapes = jsonShapesByFile.get(file) ?? []
    shapes.push(JSON.stringify(jsonShape(parsed)))
    jsonShapesByFile.set(file, shapes)
    const values = jsonValuesByFile.get(file) ?? []
    values.push(parsed)
    jsonValuesByFile.set(file, values)
    if (!isRussian) jsonCount += 1
  }

  for (const match of markdown.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](@shelamkoff\/rector[^'"]*)['"]/g)) {
    const names = match[1].split(',').map(value => value.trim().split(/\s+as\s+/)[0]).filter(Boolean)
    const specifier = match[2]
    if (!isExported(specifier)) throw new Error(`${label}: package does not export ${specifier}`)
    const modulePath = sourceModuleFor(specifier)
    if (!modulePath) throw new Error(`${label}: no source mapping for ${specifier}`)
    let exports = moduleCache.get(modulePath)
    if (!exports) {
      exports = await import(pathToFileURL(modulePath))
      moduleCache.set(modulePath, exports)
    }
    for (const name of names) {
      if (!(name in exports)) throw new Error(`${label}: ${specifier} does not export ${name}`)
    }
  }

  for (const match of markdown.matchAll(/(?:from|import)\s*['"](@shelamkoff\/[^'"]+)['"]/g)) {
    const specifier = match[1]
    if (specifier.startsWith(`${manifest.name}/`) && !isExported(specifier)) {
      throw new Error(`${label}: package does not export ${specifier}`)
    }
    if (specifier.startsWith(`${colorPickerManifest.name}/`)
      && !isExportedBy(colorPickerManifest, specifier)) {
      throw new Error(`${label}: package does not export ${specifier}`)
    }
  }
}

for (const file of readmes) {
  const russian = file.replace(/README\.md$/, 'README.ru.md')
  const englishShapes = jsonShapesByFile.get(file) ?? []
  const russianShapes = jsonShapesByFile.get(russian) ?? []
  if (JSON.stringify(englishShapes) !== JSON.stringify(russianShapes)) {
    throw new Error(`${relative(workspace, file)}: English and Russian JSON examples have different data shapes`)
  }
}

// Documentation examples are executable parts of the public data contract.
// Check both the editor and renderer examples with the same strict validator
// used for consumer documents instead of merely accepting syntactically valid
// JSON that the runtime would later reject.
for (const directory of blockPaths) {
  const type = directory === 'link-preview' ? 'linkPreview' : directory
  const Plugin = await loadBlockPlugin(type)
  const plugin = new Plugin()
  for (const file of [
    join(root, 'plugins', directory, 'README.md'),
    join(root, 'renderer', 'renderers', directory, 'README.md'),
  ]) {
    const examples = jsonValuesByFile.get(file) ?? []
    if (examples.length !== 1) {
      throw new Error(`${relative(root, file)}: expected exactly one document-data JSON example`)
    }
    if (!plugin.validate(examples[0])) {
      throw new Error(`${relative(root, file)}: documented data example fails the ${type} validator`)
    }
  }
}

let packageReadmeCopiesChecked = 0
for (const source of [...readmes.slice(1), ...russianReadmes.slice(1)]) {
  const built = join(root, 'dist', relative(root, source))
  try {
    const [sourceText, builtText] = await Promise.all([readFile(source, 'utf8'), readFile(built, 'utf8')])
    if (sourceText !== builtText) throw new Error(`${relative(root, source)}: built README is stale`)
    packageReadmeCopiesChecked += 1
  } catch (error) {
    if (error?.code === 'ENOENT') continue
    throw error
  }
}

if (exampleCount < 40) throw new Error(`Expected at least 40 JS/TS examples, got ${exampleCount}`)
// Every concrete block plugin and matching renderer has one document-data
// example. The two concrete inline plugins additionally document their
// serialized markup. Derive the contract from the catalog so adding a block
// cannot leave this gate with an unexplained stale magic number.
const expectedJsonCount = blockPaths.length * 2 + 2
if (jsonCount !== expectedJsonCount) {
  throw new Error(`Expected ${expectedJsonCount} data JSON examples, got ${jsonCount}`)
}

console.log(JSON.stringify({
  readmes: allReadmes.length,
  languages: ['en', 'ru'],
  examples: exampleCount,
  json: jsonCount,
  links: linkCount,
  imports: true,
  encoding: true,
  packageReadmeCopiesChecked,
}))
