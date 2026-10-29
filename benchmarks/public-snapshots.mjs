import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { cpus, loadavg, release, totalmem } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// node benchmarks/public-snapshots.mjs /path/to/baseline /path/to/candidate
// Measures the full synchronous public query/producer adapter and runtime path.
// This is deliberately headless: it is not a native-input, DOM/paint, retained-
// memory or Table/Gallery/Columns acceptance benchmark.
const roots = process.argv.slice(2).map(value => resolve(value))
if (roots.length !== 2) throw new Error('Provide baseline and candidate repository paths')
const files = [
  'core/PublicEditorApi.js', 'core/DocumentRuntime.js', 'core/DocumentStore.js',
  'core/TransactionEngine.js', 'core/HistoryStore.js', 'shared/jsonData.js',
  'shared/cloneEditorData.js', 'shared/versionedDataSchema.js', 'package-lock.json',
]
const hash = value => createHash('sha256').update(value).digest('hex')
const sourceHashes = async root => Object.fromEntries(await Promise.all(files.map(async file => [
  file, hash(await readFile(`${root}/${file}`)),
])))
const variants = await Promise.all(roots.map(async (root, index) => {
  const load = file => import(pathToFileURL(`${root}/${file}`).href)
  const [{ DocumentRuntime }, { EditorBlocksApi }, { createVersionedDataSchema }] = await Promise.all([
    load('core/DocumentRuntime.js'), load('core/PublicEditorApi.js'), load('shared/versionedDataSchema.js'),
  ])
  return {
    label: index === 0 ? 'baseline' : 'candidate', root,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    hashes: await sourceHashes(root), DocumentRuntime, EditorBlocksApi, createVersionedDataSchema,
  }
}))

const shapes = [
  { name: 'small', blocks: 1, rows: 1, columns: 1, warmup: 30, samples: 21, batch: 50 },
  { name: 'large-structured', blocks: 3, rows: 25, columns: 20, warmup: 5, samples: 21, batch: 1 },
]
const data = (shape, id) => ({
  label: id,
  text: '<strong>Rich text</strong> &amp; ordinary text',
  rows: Array.from({ length: shape.rows }, (_, row) => ({
    cells: Array.from({ length: shape.columns }, (_, column) => ({
      text: `<em>Cell ${row}:${column}</em>`,
      metadata: { alignment: 'left', tags: ['retained', 'ordinary'] },
    })),
  })),
})

function fixture(variant, shape) {
  const schema = variant.createVersionedDataSchema({ currentVersion: 1, createDefault: () => data(shape, 'default'), normalize: value => value })
  const definition = { type: 'snapshot-benchmark', schema }
  const input = { version: '2.0.0', blocks: Array.from({ length: shape.blocks }, (_, index) => ({
    id: `block-${index}`, type: definition.type, dataVersion: 1, data: data(shape, `block-${index}`),
  })) }
  let commits = 0
  const runtime = new variant.DocumentRuntime({
    registry: {
      defaultBlockType: definition.type,
      hasBlock: type => type === definition.type,
      getBlockDefinition: type => type === definition.type ? definition : undefined,
      getInlineDefinition: () => undefined,
    },
    data: input,
    history: { maxStack: 1 },
    onCommit: () => { commits++ },
  })
  return { runtime, api: new variant.EditorBlocksApi({ runtime, view: {} }), commits: () => commits,
    documentUtf8Bytes: Buffer.byteLength(JSON.stringify(input), 'utf8') }
}

let consumed = 0
const methods = {
  get: h => () => { consumed += h.api.get('block-0').data.text.length },
  at: h => () => { consumed += h.api.at(0).data.text.length },
  list: h => () => { consumed += h.api.list().length },
  iterator: h => () => { consumed += [...h.api].length },
  'update-noop': h => () => { h.api.update('block-0', () => ({})) },
  'update-commit': h => {
    let sequence = 0
    return () => { h.api.update('block-0', current => ({ data: { ...current.data, label: `edit-${++sequence}` } })) }
  },
}
const percentile = (values, ratio) => {
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))]
}
const results = []
const startedAt = new Date().toISOString()
const loadBefore = loadavg()
for (const shape of shapes) {
  for (const [method, createOperation] of Object.entries(methods)) {
    const subjects = variants.map(variant => {
      const h = fixture(variant, shape)
      return { variant, h, operation: createOperation(h), durations: [] }
    })
    try {
      for (const subject of subjects) {
        for (let count = 0; count < shape.warmup; count++) subject.operation()
      }
      for (let sample = 0; sample < shape.samples; sample++) {
        // Alternate the order to reduce a consistent first/second-run bias.
        for (const subject of sample % 2 ? [...subjects].reverse() : subjects) {
          const began = performance.now()
          for (let count = 0; count < shape.batch; count++) subject.operation()
          subject.durations.push((performance.now() - began) / shape.batch)
        }
      }
      for (const { variant, h, durations } of subjects) {
        const expectedCommits = method === 'update-commit' ? shape.warmup + shape.samples * shape.batch : 0
        assert.equal(h.commits(), expectedCommits)
        assert.equal(h.runtime.revision, expectedCommits)
        results.push({
          variant: variant.label, shape: shape.name, method, documentUtf8Bytes: h.documentUtf8Bytes,
          p50Ms: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95),
          minimumMs: Math.min(...durations), maximumMs: Math.max(...durations),
          sampleMs: durations, observedCommits: h.commits(),
        })
      }
    } finally { for (const subject of subjects) subject.h.runtime.destroy() }
  }
}

const unchanged = await Promise.all(variants.map(async variant => (
  JSON.stringify(variant.hashes) === JSON.stringify(await sourceHashes(variant.root))
)))
assert.ok(unchanged.every(Boolean), 'A measured source changed during the comparison')
console.log(JSON.stringify({
  measuredBoundary: 'Synchronous EditorBlocksApi + real DocumentRuntime/store/schema/history/event pipeline; default no-op projection; construction excluded',
  excluded: ['DOM/paint/layout', 'native input/IME', 'scheduled UI work', 'retained memory', 'built-in structural-plugin acceptance'],
  history: { maxStack: 1, maxBytes: 'omitted' },
  environment: { node: process.version, v8: process.versions.v8, platform: process.platform, architecture: process.arch,
    osRelease: release(), cpuModel: cpus()[0]?.model, cpuCount: cpus().length, memoryBytes: totalmem(),
    browser: 'not used', loadBefore, loadAfter: loadavg() },
  startedAt, finishedAt: new Date().toISOString(),
  runnerSha256: hash(await readFile(new URL(import.meta.url))), sourceUnchanged: unchanged.every(Boolean),
  variants: variants.map(({ label, root, head, hashes }) => ({ label, root, head, hashes })),
  shapes, results, consumed,
}, null, 2))
