import { transformWithEsbuild } from 'vite'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateDeclarations } from './generate-declarations.mjs'

const editorRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distRoot = join(editorRoot, 'dist')
const sourceRoots = ['core', 'inline-plugins', 'inline-tools', 'locale', 'plugins', 'renderer', 'shared']
const blockTypes = [
  'paragraph', 'heading', 'list', 'quote', 'code', 'image', 'delimiter', 'table',
  'checklist', 'warning', 'embed', 'raw', 'gallery', 'carousel', 'attaches', 'link-preview',
  'toggle', 'columns', 'spoiler', 'poll', 'person',
]
const sourceEditorTypes = new Set(['image', 'gallery', 'carousel', 'attaches'])
const rendererTypes = blockTypes
const pluginDependencyStyles = {
  person: ['@shelamkoff/cropper/styles.css'],
}
const rendererDependencyStyles = {
  carousel: ['@shelamkoff/carousel/styles.css'],
  gallery: ['@shelamkoff/expose/styles.css'],
  person: ['@shelamkoff/carousel/styles.css'],
}

async function walk(directory, result = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) await walk(absolute, result)
    else result.push(absolute)
  }
  return result
}

function isPublishableSource(path) {
  const normalized = path.replaceAll('\\', '/')
  return !normalized.includes('/tests/')
    && !normalized.includes('/benchmarks/')
    && !normalized.endsWith('.test.js')
    && ['.js', '.css', '.md'].includes(extname(path))
}

async function copyRuntime() {
  for (const root of sourceRoots) {
    const sourceRoot = join(editorRoot, root)
    for (const source of await walk(sourceRoot)) {
      if (!isPublishableSource(source)) continue
      const destination = join(distRoot, relative(editorRoot, source))
      await mkdir(dirname(destination), { recursive: true })
      if (extname(source) === '.css') {
        const result = await transformWithEsbuild(await readFile(source, 'utf8'), source, { loader: 'css', minify: true })
        await writeFile(destination, result.code, 'utf8')
      } else if (extname(source) === '.js') {
        // Preserve cacheable CSS URLs in bundlers as well as native browsers.
        // Vite recognizes no-inline; native servers simply ignore the query.
        const code = (await readFile(source, 'utf8')).replace(
          /new URL\((['"])([^'"]+\.css)\1,\s*import\.meta\.url\)/g,
          (_, quote, path) => `new URL(${quote}${path}?no-inline${quote}, import.meta.url)`,
        )
        await writeFile(destination, code, 'utf8')
      } else {
        await cp(source, destination)
      }
    }
  }
  await cp(join(editorRoot, 'index.js'), join(distRoot, 'index.js'))
}

async function writeStyleEntrypoints() {
  const stylesRoot = join(distRoot, 'styles')
  await mkdir(stylesRoot, { recursive: true })
  await writeFile(join(stylesRoot, 'editor.css'), [
    "@import '../core/themes/variables.css';",
    "@import '../core/themes/light.css';",
    "@import '../core/themes/dark.css';",
    '',
  ].join('\n'), 'utf8')

  await writeFile(join(stylesRoot, 'renderer.css'), [
    "@import '../renderer/styles/base.css';",
    '',
  ].join('\n'), 'utf8')

  const pluginStylesRoot = join(stylesRoot, 'plugins')
  await mkdir(pluginStylesRoot, { recursive: true })
  for (const type of blockTypes) {
    const imports = [`../../plugins/${type}/${type}.css`]
    if (sourceEditorTypes.has(type)) imports.push('../../plugins/shared/sourceEditor.css')
    imports.push(...(pluginDependencyStyles[type] ?? []))
    await writeFile(
      join(pluginStylesRoot, `${type}.css`),
      `${imports.map(path => `@import '${path}';`).join('\n')}\n`,
      'utf8',
    )
  }

  const inlineStylesRoot = join(stylesRoot, 'inline-plugins')
  await mkdir(inlineStylesRoot, { recursive: true })
  await writeFile(join(inlineStylesRoot, 'color.css'), "@import '@shelamkoff/color-picker/styles.css';\n", 'utf8')
  await writeFile(join(inlineStylesRoot, 'mention.css'), "@import '../../inline-plugins/mention/styles.css';\n", 'utf8')

  const rendererStylesRoot = join(stylesRoot, 'renderers')
  await mkdir(rendererStylesRoot, { recursive: true })
  for (const type of rendererTypes) {
    const imports = type === 'raw'
      ? []
      : [
          `../../renderer/renderers/${type}/styles.css`,
          ...(rendererDependencyStyles[type] ?? []),
        ]
    await writeFile(
      join(rendererStylesRoot, `${type}.css`),
      imports.length > 0
        ? `${imports.map(path => `@import '${path}';`).join('\n')}\n`
        : '/* Raw rendering relies only on the shared renderer stylesheet. */\n',
      'utf8',
    )
  }

  const aggregateImports = [
    './styles/editor.css',
    './styles/renderer.css',
    ...blockTypes.map(type => `./styles/plugins/${type}.css`),
    './styles/inline-plugins/color.css',
    './styles/inline-plugins/mention.css',
    ...rendererTypes.map(type => `./styles/renderers/${type}.css`),
  ]
  await writeFile(
    join(distRoot, 'styles.css'),
    `${aggregateImports.map(path => `@import '${path}';`).join('\n')}\n`,
    'utf8',
  )
}

await rm(distRoot, { recursive: true, force: true })
await mkdir(distRoot, { recursive: true })
const declarations = await generateDeclarations(distRoot)
if (declarations.sourceDiagnostics > 0) {
  throw new Error(`Declaration generation reported ${declarations.sourceDiagnostics} source diagnostics:\n${declarations.sourceDiagnosticDetails.join('\n')}`)
}
await copyRuntime()
await writeStyleEntrypoints()

console.log(JSON.stringify({ ...declarations, dist: relative(editorRoot, distRoot) }))
