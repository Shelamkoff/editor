import { access, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

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

for (const file of allReadmes) {
  const markdown = await readFile(file, 'utf8')
  const label = relative(workspace, file)
  const isRussian = file.endsWith('README.ru.md')
  if (!markdown.startsWith('# ')) throw new Error(`${label}: missing H1`)
  if (isRussian && !/[А-Яа-яЁё]/.test(markdown)) throw new Error(`${label}: Russian translation has no Cyrillic text`)
  if (/\uFFFD/.test(markdown) || (!isRussian && /(?:вЂ|в”|Р[Ђ-џ])/.test(markdown))) {
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
  }

  const sourceRelative = relative(root, file).replaceAll('\\', '/')
  if (/^plugins\/[^/]+\/README(?:\.ru)?\.md$/.test(sourceRelative)
    && !markdown.includes("@shelamkoff/rector/styles/editor.css")) {
    throw new Error(`${label}: block plugin example does not import editor styles`)
  }
  if (/^renderer\/renderers\/[^/]+\/README(?:\.ru)?\.md$/.test(sourceRelative)) {
    if (!markdown.includes('renderer.injectStyles()') || !markdown.includes('rendererStyles.destroy()')) {
      throw new Error(`${label}: renderer example has an asymmetric stylesheet lifecycle`)
    }
  }
  if (/^inline-plugins\/color\/README(?:\.ru)?\.md$/.test(sourceRelative)
    && !markdown.includes("@shelamkoff/color-picker/styles.css")) {
    throw new Error(`${label}: color widget example does not import color-picker styles`)
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
    try { JSON.parse(match[1]) } catch (error) {
      throw new Error(`${label}: invalid JSON example: ${error.message}`)
    }
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

for (const source of [...readmes.slice(1), ...russianReadmes.slice(1)]) {
  const built = join(root, 'dist', relative(root, source))
  try {
    const [sourceText, builtText] = await Promise.all([readFile(source, 'utf8'), readFile(built, 'utf8')])
    if (sourceText !== builtText) throw new Error(`${relative(root, source)}: built README is stale`)
  } catch (error) {
    if (error?.code === 'ENOENT') continue
    throw error
  }
}

if (exampleCount < 40) throw new Error(`Expected at least 40 JS/TS examples, got ${exampleCount}`)
if (jsonCount !== 42) throw new Error(`Expected 42 block-data JSON examples, got ${jsonCount}`)

console.log(JSON.stringify({ readmes: allReadmes.length, languages: ['en', 'ru'], examples: exampleCount, json: jsonCount, links: linkCount, imports: true, encoding: true, builtCopies: true }))
