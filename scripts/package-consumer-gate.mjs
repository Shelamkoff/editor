import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const editorRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const node = process.execPath
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run this gate through `npm run test:package` so npm_execpath is available')
const tscCli = resolve(editorRoot, 'node_modules/typescript/bin/tsc')
const viteCli = resolve(editorRoot, 'node_modules/vite/bin/vite.js')

function run(executable, args, cwd, options = {}) {
  return execFileSync(executable, args, { cwd, encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit' })
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function collectExportTargets(exports, result = []) {
  if (typeof exports === 'string') result.push(exports)
  else if (exports && typeof exports === 'object') {
    for (const value of Object.values(exports)) collectExportTargets(value, result)
  }
  return result
}

async function assertExportTargets(packageRoot) {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  const missing = []
  for (const target of collectExportTargets(manifest.exports)) {
    if (target.includes('*')) continue
    try { await readFile(join(packageRoot, target), 'utf8') } catch { missing.push(target) }
  }
  if (missing.length) throw new Error(`Missing package export targets: ${missing.join(', ')}`)
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'ophire-editor-package-'))
const npmCache = join(temporaryRoot, 'npm-cache')
try {
  run(node, [npmCli, 'run', 'build'], editorRoot)
  await assertExportTargets(editorRoot)

  const packageFiles = await readdir(resolve(editorRoot, 'dist'), { recursive: true })
  for (const relativePath of packageFiles.filter(path => /\.(?:js|d\.ts)$/.test(path))) {
    const content = await readFile(join(editorRoot, 'dist', relativePath), 'utf8')
    if (/\.\.\/\.\.\/(?:event-bus|color-picker|cropper|carousel|expose)\//.test(content)) {
      throw new Error(`Unpublished local dependency boundary remains in dist/${relativePath}`)
    }
  }

  const packRoot = join(temporaryRoot, 'pack')
  await mkdir(packRoot)
  const packOutput = run(node, [npmCli, 'pack', '--ignore-scripts', '--pack-destination', packRoot, '--cache', npmCache], editorRoot, { capture: true }).trim()
  const tarball = join(packRoot, basename(packOutput.split(/\r?\n/).at(-1)))
  const tarEntries = run('tar', ['-tf', tarball], editorRoot, { capture: true }).split(/\r?\n/).filter(Boolean)
  const blockReadmes = [
    'paragraph', 'heading', 'list', 'quote', 'code', 'image', 'delimiter', 'table',
    'checklist', 'warning', 'embed', 'raw', 'gallery', 'carousel', 'attaches', 'link-preview',
    'toggle', 'columns', 'spoiler', 'poll', 'person',
  ]
  const requiredEntries = [
    'package/README.md',
    'package/LICENSE',
    'package/NOTICE',
    'package/THIRD_PARTY_LICENSES.txt',
    'package/dist/plugins/README.md',
    'package/dist/plugins/README.ru.md',
    'package/dist/inline-plugins/README.md',
    'package/dist/inline-plugins/README.ru.md',
    'package/dist/inline-plugins/color/README.md',
    'package/dist/inline-plugins/color/README.ru.md',
    'package/dist/inline-plugins/mention/README.md',
    'package/dist/inline-plugins/mention/README.ru.md',
    'package/dist/renderer/renderers/README.md',
    'package/dist/renderer/renderers/README.ru.md',
    ...blockReadmes.map(type => `package/dist/plugins/${type}/README.md`),
    ...blockReadmes.map(type => `package/dist/plugins/${type}/README.ru.md`),
    ...blockReadmes.map(type => `package/dist/renderer/renderers/${type}/README.md`),
    ...blockReadmes.map(type => `package/dist/renderer/renderers/${type}/README.ru.md`),
  ]
  const missingEntries = requiredEntries.filter(entry => !tarEntries.includes(entry))
  if (missingEntries.length) throw new Error(`Tarball misses publication files: ${missingEntries.join(', ')}`)
  const forbiddenEntry = tarEntries.find(entry => /(?:^|\/)(?:node_modules|tests|benchmarks|docs|\.vitepress)(?:\/|$)|\.(?:html|vue)$/.test(entry))
  if (forbiddenEntry) throw new Error(`Tarball contains a development-only file: ${forbiddenEntry}`)

  const dependencyPackRoot = join(temporaryRoot, 'dependencies')
  await mkdir(dependencyPackRoot, { recursive: true })
  const dependencyDirectories = ['event-bus', 'color-picker', 'cropper', 'carousel', 'expose']
  const dependencyReadmes = {
    carousel: ['arrows', 'dots', 'thumbnails', 'keyboard', 'swipe', 'autoplay', 'lazyload', 'parallax'],
    expose: ['captions', 'zoom', 'thumbnails', 'autoplay', 'transform', 'download', 'fullscreen'],
  }
  const dependencyTarballs = []
  for (const directory of dependencyDirectories) {
    const packageRoot = resolve(editorRoot, '..', directory)
    const output = run(node, [
      npmCli,
      'pack',
      '--pack-destination', dependencyPackRoot,
      '--cache', npmCache,
    ], packageRoot, { capture: true }).trim()
    const dependencyTarball = join(dependencyPackRoot, basename(output.split(/\r?\n/).at(-1)))
    dependencyTarballs.push(dependencyTarball)
    const entries = run('tar', ['-tf', dependencyTarball], packageRoot, { capture: true }).split(/\r?\n/).filter(Boolean)
    const required = ['package/README.md', 'package/README.ru.md', 'package/LICENSE', 'package/package.json']
    for (const plugin of dependencyReadmes[directory] ?? []) {
      required.push(`package/dist/src/plugins/${plugin}/README.md`)
      required.push(`package/dist/src/plugins/${plugin}/README.ru.md`)
    }
    const missing = required.filter(entry => !entries.includes(entry))
    if (missing.length) throw new Error(`${directory} tarball misses: ${missing.join(', ')}`)
  }

  const consumerRoot = join(temporaryRoot, 'consumer')
  await mkdir(join(consumerRoot, 'src'), { recursive: true })
  await writeJson(join(consumerRoot, 'package.json'), { private: true, type: 'module' })
  run(node, [
    npmCli,
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--cache', npmCache,
    tarball,
    ...dependencyTarballs,
  ], consumerRoot)

  const consumerSource = `
import { createEditor, DocumentSchema } from '@shelamkoff/rector'
import { Attaches, CarouselBlock, Embed, LinkPreview, Paragraph, Person, Poll } from '@shelamkoff/rector/plugins'
import { createBlockPluginsAsync } from '@shelamkoff/rector/plugins/async'
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'
import { createBoldTool } from '@shelamkoff/rector/inline-tools/bold'
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createDefaultRenderersAsync } from '@shelamkoff/rector/renderer/renderers/async'
import { EventBus } from '@shelamkoff/event-bus'
import { ColorPicker, colorPickerStylesUrl, parseColorInput } from '@shelamkoff/color-picker'
import { Carousel, carouselStylesUrl } from '@shelamkoff/carousel'
import { Cropper, cropperStylesUrl } from '@shelamkoff/cropper'
import { Expose, exposeStylesUrl } from '@shelamkoff/expose'
import '@shelamkoff/rector/styles/editor.css'
import '@shelamkoff/color-picker/styles.css'
const configuredPlugins = [
  new CarouselBlock({
    uploadFile: async (file, { signal }) => ({ url: signal.aborted ? '' : URL.createObjectURL(file) }),
    actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : [{ id: 'slide-1', type: 'image', src: 'https://example.com/slide.jpg' }] }],
  }),
  new Attaches({
    uploadFile: async (file, { signal }) => ({ url: signal.aborted ? '' : URL.createObjectURL(file), size: file.size }),
    actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : [{ url: 'https://example.com/file.pdf', name: 'file.pdf', extension: 'pdf' }] }],
  }),
  new Embed({
    actions: [{ icon: '', label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ({ url: 'https://example.com/cover.jpg' }) }],
    resolvePreview: async ({ signal }) => signal.aborted ? null : ({ thumbnailUrl: 'https://example.com/thumb.jpg' }),
  }),
  new LinkPreview({ fetchMeta: async (url, { signal }) => signal.aborted ? {} : ({ title: url, domain: 'example.com' }) }),
  new Person({
    uploadFile: async (file, { signal }) => ({ url: signal.aborted ? '' : URL.createObjectURL(file) }),
    socialResolvers: [{ test: url => url.includes('example.com'), type: 'website' }],
  }),
  new Poll({
    dataSource: {
      load: async () => ({ revision: '1', total: 0, options: [] }),
      vote: async ({ optionIds }) => ({ revision: '2', total: optionIds.length, options: optionIds.map(id => ({ id, votes: 1 })) }),
    },
  }),
]
const mentionPlugin = createMentionPlugin({
  searchFunction: async (_query, _nextPageUrl, { signal }) => signal.aborted ? [] : [{ id: '1', name: 'Ada' }],
})
function usePublicEditorApi(editor = createEditor({
  holder: document.createElement('div'),
  plugins: [new Paragraph()],
  inlineTools: [],
})) {
  const available = [editor.readOnly, editor.canUndo, editor.canRedo]
  editor.undo()
  editor.redo()
  void editor.setReadOnly(!editor.readOnly)
  return available
}
void [createEditor, DocumentSchema, Paragraph, Person, configuredPlugins, createBlockPluginsAsync, mentionPlugin, createBoldTool, createEditorRenderer, createDefaultRenderersAsync, EventBus, ColorPicker, parseColorInput, Carousel, Cropper, Expose, colorPickerStylesUrl, carouselStylesUrl, cropperStylesUrl, exposeStylesUrl, usePublicEditorApi]
`
  await writeFile(join(consumerRoot, 'src/main.js'), consumerSource, 'utf8')
  const consumerTypeSource = `${consumerSource}
import type { EditorConfig, IEditor } from '@shelamkoff/rector'
import type { EditorTuning, InlinePlugin } from '@shelamkoff/rector/types'
import type { OutputData, ParagraphBlock, RendererConfig } from '@shelamkoff/rector/renderer/types'
declare const publicEditor: IEditor
declare const editorConfig: EditorConfig
declare const tuning: EditorTuning
declare const inlinePlugin: InlinePlugin
declare const output: OutputData
declare const paragraph: ParagraphBlock
declare const rendererConfig: RendererConfig
void [publicEditor, editorConfig, tuning, inlinePlugin, output, paragraph, rendererConfig]
`
  await writeFile(join(consumerRoot, 'src/main.ts'), consumerTypeSource, 'utf8')
  await writeFile(join(consumerRoot, 'index.html'), '<script type="module" src="/src/main.js"></script>\n', 'utf8')

  for (const moduleResolution of ['Bundler', 'NodeNext']) {
    await writeJson(join(consumerRoot, `tsconfig.${moduleResolution.toLowerCase()}.json`), {
      compilerOptions: {
        target: 'ES2022',
        module: moduleResolution === 'NodeNext' ? 'NodeNext' : 'ESNext',
        moduleResolution,
        strict: true,
        noEmit: true,
        skipLibCheck: false,
      },
      include: ['src/main.ts'],
    })
    run(node, [tscCli, '-p', `tsconfig.${moduleResolution.toLowerCase()}.json`], consumerRoot)
  }

  run(node, [viteCli, 'build'], consumerRoot)
  run(node, ['--input-type=module', '-e', "import('@shelamkoff/rector').then(m => { if (typeof m.createEditor !== 'function') process.exit(1) })"], consumerRoot)
  console.log(JSON.stringify({ tarball: basename(tarball), typeModes: ['Bundler', 'NodeNext'], vite: 'passed', import: 'passed' }))
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
