import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { measureBundleOutput } from './bundle-report.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const moduleId = name => join(root, name)
const chunk = (overrides = {}) => ({
  type: 'chunk', fileName: 'entry.js', isEntry: true, code: 'export const text = "hello";',
  imports: [], dynamicImports: [],
  modules: { [moduleId('dist/plugins/paragraph/index.js')]: { renderedLength: 28 } },
  ...overrides,
})
const measure = (outputs, options = {}) => measureBundleOutput({ output: outputs }, {
  root, preset: 'paragraph', referenceBytes: 40 * 1024, ...options,
})

test('measurement includes each static chunk once and all CSS in stable order, excluding lazy JS and external packages', () => {
  const entry = chunk({ imports: ['chunks/shared.js', '@shelamkoff/event-bus'], dynamicImports: ['chunks/lazy.js'] })
  const shared = chunk({ fileName: 'chunks/shared.js', isEntry: false, code: 'export const shared = 1;', imports: ['entry.js'],
    modules: { [moduleId('dist/shared/jsonData.js')]: { renderedLength: 24 } } })
  const lazy = chunk({ fileName: 'chunks/lazy.js', isEntry: false, code: 'lazy'.repeat(1000),
    modules: { [moduleId('dist/plugins/heading/index.js')]: { renderedLength: 4000 } } })
  const assets = [
    { type: 'asset', fileName: 'z.css', source: Buffer.from('.z { color: blue; }') },
    { type: 'asset', fileName: 'a.css', source: '.a { color: red; }' },
    { type: 'asset', fileName: 'image.svg', source: '<svg />' },
  ]
  const row = measure([entry, lazy, ...assets, shared])
  const javascript = `${entry.code}\n${shared.code}`
  const css = '.a { color: red; }\n.z { color: blue; }'
  assert.equal(row.rawBytes, Buffer.byteLength(javascript) + Buffer.byteLength(css))
  assert.equal(row.gzipBytes, gzipSync(javascript).byteLength + gzipSync(css).byteLength)
  assert.deepEqual(row.staticChunks, ['entry.js', 'chunks/shared.js'])
  assert.deepEqual(row.staticModules, ['dist/plugins/paragraph/index.js', 'dist/shared/jsonData.js'])
  assert.deepEqual(row.cssAssets, ['a.css', 'z.css'])
  assert.deepEqual(row.externalImports, ['@shelamkoff/event-bus'])
  assert.deepEqual(row.dynamicImports, ['chunks/lazy.js'])
  assert.deepEqual(measure([entry, shared, ...assets.toReversed(), lazy]), row)
})

test('exact bytes preserve a 12-byte excess even when rounded KiB values agree', () => {
  const entry = chunk({ code: 'a'.repeat(100) })
  const gzipBytes = gzipSync(entry.code).byteLength
  const referenceBytes = gzipBytes - 12
  const row = measure([entry], { referenceBytes })
  assert.equal(row.referenceBytes, referenceBytes)
  assert.equal(row.deltaBytes, 12)
  assert.equal(row.aboveReference, true)
  assert.equal((row.gzipBytes / 1024).toFixed(1), (row.referenceBytes / 1024).toFixed(1))
})

test('malformed build outputs and missing or ambiguous entries are fatal', () => {
  for (const result of [null, {}, { output: 'invalid' }, []]) {
    assert.throws(() => measureBundleOutput(result, { root, preset: 'paragraph', referenceBytes: 40960 }), /output|entry/i)
  }
  assert.throws(() => measure([]), /entry/i)
  assert.throws(() => measure([chunk({ isEntry: false })]), /entry/i)
  assert.throws(() => measure([chunk(), chunk({ fileName: 'another.js' })]), /entry/i)
})

test('missing emitted static chunks cannot be silently omitted from the measurement', () => {
  assert.throws(() => measure([chunk({ imports: ['chunks/missing.js'] })]), /missing.*chunks\/missing\.js/i)
})

test('invalid reference values and absent module graphs cannot produce a successful report', () => {
  for (const referenceBytes of [undefined, null, '40960', -1, 0, 1.5, NaN, Infinity]) {
    assert.throws(() => measure([chunk()], { referenceBytes }), /reference/i)
  }
  for (const modules of [undefined, null, [], 'missing']) {
    assert.throws(() => measure([chunk({ modules })]), /module graph/i)
  }
})

test('missing or non-text chunk code cannot masquerade as a small bundle', () => {
  for (const code of [undefined, null, {}, new Uint8Array([1])]) {
    assert.throws(() => measure([chunk({ code })]), /code/i)
  }
})

test('duplicate or missing output filenames cannot replace the measured entry', () => {
  assert.throws(() => measure([chunk(), chunk({ isEntry: false, code: '' })]), /duplicate.*entry\.js/i)
  assert.throws(() => measure([chunk({ fileName: '' })]), /file.*name/i)
})

test('static and lazy import lists require arrays of nonempty identifiers', () => {
  for (const property of ['imports', 'dynamicImports']) {
    for (const value of [undefined, '', {}, [null], [''], [42], Array(1)]) {
      assert.throws(() => measure([chunk({ [property]: value })]), /imports/i)
    }
  }
})

test('rendered module lengths must be nonnegative safe integers', () => {
  for (const renderedLength of [undefined, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => measure([chunk({ modules: {
      [moduleId('dist/plugins/paragraph/index.js')]: { renderedLength },
    } })]), /module measurement/i)
  }
})

test('shared helpers and eliminated barrel exports remain allowed in the selective paragraph entry', () => {
  const row = measure([chunk({ modules: {
    [moduleId('dist/plugins/paragraph/index.js')]: { renderedLength: 20 },
    [moduleId('dist/plugins/shared/textConversion.js')]: { renderedLength: 12 },
    [moduleId('dist/shared/jsonData.js')]: { renderedLength: 5 },
    [moduleId('dist/plugins/index.js')]: { renderedLength: 0 },
    [moduleId('dist/plugins/heading/index.js')]: { renderedLength: 0 },
  } })])
  assert.deepEqual(row.staticModules, [
    'dist/plugins/paragraph/index.js', 'dist/plugins/shared/textConversion.js', 'dist/shared/jsonData.js',
  ])
})

for (const name of ['dist/core/Editor.js', 'dist/plugins/heading/index.js']) {
  test(`paragraph rejects retained static JavaScript from ${name}`, () => {
    assert.throws(() => measure([chunk({ modules: { [moduleId(name)]: { renderedLength: 1 } } })]), /paragraph.*forbidden/i)
  })
}

test('the inline-tools preset rejects retained block-plugin JavaScript', () => {
  assert.throws(() => measure([chunk()], { preset: 'defaultInteractive' }), /defaultInteractive.*forbidden/i)
})

test('CSS requires text or bytes and remains independent of non-CSS assets', () => {
  assert.throws(() => measure([chunk(), { type: 'asset', fileName: 'broken.css', source: {} }]), /css.*source/i)
  assert.deepEqual(measure([chunk(), { type: 'asset', fileName: 'image.png', source: new Uint8Array([0, 255]) }]), measure([chunk()]))
})

test('a real bundler keeps the selective graph and detects an injected foreign block dependency', async t => {
  const { build } = await import('vite')
  const directory = await mkdtemp(join(tmpdir(), 'rector-bundle-graph-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const paragraph = join(directory, 'dist/plugins/paragraph/index.js')
  for (const path of ['dist/plugins/paragraph', 'dist/plugins/heading', 'dist/shared']) {
    await mkdir(join(directory, path), { recursive: true })
  }
  await writeFile(join(directory, 'dist/shared/value.js'), 'export const text = "paragraph";\n')
  await writeFile(join(directory, 'dist/plugins/heading/index.js'), 'export const heading = "heading";\n')
  await writeFile(paragraph, 'export { text } from "../../shared/value.js";\n')
  const bundle = () => build({
    configFile: false, root: directory, logLevel: 'error',
    build: { write: false, minify: 'esbuild', target: 'es2022', rollupOptions: {
      input: paragraph, preserveEntrySignatures: 'strict', output: { format: 'es' },
    } },
  })
  const options = { root: directory, preset: 'paragraph', referenceBytes: 40960 }
  const row = measureBundleOutput(await bundle(), options)
  assert.ok(row.gzipBytes > 0)
  assert.deepEqual(row.staticModules, ['dist/shared/value.js'])
  await writeFile(paragraph, 'export { text } from "../../shared/value.js"; export { heading } from "../heading/index.js";\n')
  const injected = await bundle()
  assert.throws(() => measureBundleOutput(injected, options), /paragraph.*forbidden.*heading/i)
})
