import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// node benchmarks/canonical-read-work.mjs BASELINE CANDIDATE [OUTPUT_JSON] [all|changed]
// Deterministic JSON-boundary work, not timing. Real runtime/public adapters
// and Table schema; a headless projection port supplies authored data. Live
// DOM ownership, native input and paint require the separate browser controls.
const [baseline, candidate, output, expectedReduction = 'all'] = process.argv.slice(2)
assert(baseline && candidate, 'Provide baseline and candidate source checkouts')
assert(['all', 'changed'].includes(expectedReduction), 'Expected reduction must be all or changed')
const files = ['core/DocumentRuntime.js', 'core/DocumentStore.js', 'core/TransactionEngine.js',
  'core/HistoryStore.js', 'core/PublicEditorApi.js', 'core/CanonicalTransforms.js',
  'shared/jsonData.js', 'shared/cloneEditorData.js', 'shared/snapshotDataSchema.js',
  'shared/versionedDataSchema.js', 'shared/blockSchemas/table.js', 'package-lock.json']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceHashes = async root => Object.fromEntries(await Promise.all(files.map(async file =>
  [file, hash(await readFile(`${root}/${file}`))])))
const variants = await Promise.all([baseline, candidate].map(async (path, index) => {
  const root = resolve(path), load = file => import(pathToFileURL(`${root}/${file}`).href)
  const [{ DocumentRuntime }, { EditorBlocksApi }, { snapshotDataSchema }, { tableDataSchema }] = await Promise.all([
    load('core/DocumentRuntime.js'), load('core/PublicEditorApi.js'),
    load('shared/snapshotDataSchema.js'), load('shared/blockSchemas/table.js'),
  ])
  return { label: index ? 'candidate' : 'baseline', root,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    hashes: await sourceHashes(root), DocumentRuntime, EditorBlocksApi, snapshotDataSchema, tableDataSchema }
}))

function observe(operation) {
  const counts = { jsonRecordVisits: 0, tablePayloadVisits: 0 }
  const original = Object.getOwnPropertySymbols
  Object.getOwnPropertySymbols = value => {
    counts.jsonRecordVisits++
    if (Array.isArray(Object.getOwnPropertyDescriptor(value, 'rows')?.value)) counts.tablePayloadVisits++
    return original(value)
  }
  try { operation(); return counts }
  finally { Object.getOwnPropertySymbols = original }
}

function run(variant, size, command) {
  const data = { withHeadings: false, rows: Array.from({ length: size }, (_, row) => ({
    id: `row-${row}`, cells: Array.from({ length: size }, (_, column) => ({ id: `cell-${column}`, text: 'Alpha' })),
  })) }
  const input = { version: '2.0.0', blocks: [{ id: 'probe', type: 'table', dataVersion: 2, data }] }
  const inputBefore = JSON.stringify(input), changed = structuredClone(data)
  changed.rows[0].cells[0].text = 'AlphaX'
  const definition = { type: 'table', schema: variant.snapshotDataSchema(variant.tableDataSchema, 'Table', { richText: true }) }
  const commits = []
  let projected = structuredClone(data)
  const runtime = new variant.DocumentRuntime({
    registry: { defaultBlockType: 'table', hasBlock: type => type === 'table',
      getBlockDefinition: type => type === 'table' ? definition : undefined, getInlineDefinition: () => undefined },
    data: input, history: { maxStack: 1 }, onCommit: event => commits.push(event),
    projector: { readBlock: () => ({ data: projected }), restore() {},
      prepare: () => ({ apply() {}, recover() {}, finalize() {}, discard() {} }) },
  })
  const api = new variant.EditorBlocksApi({ runtime, view: {} })
  try {
    const before = runtime.save().blocks
    const counts = observe(() => {
      if (command === 'public-change') api.update('probe', () => ({ data: changed }))
      else if (command === 'public-noop-empty') api.update('probe', () => ({}))
      else if (command === 'public-noop-equal') api.update('probe', () => ({ data: structuredClone(data) }))
      else runtime.syncBlockFromProjection('probe', () => { projected = command === 'projection-change' ? changed : projected })
    })
    const edits = command.endsWith('-change')
    assert.deepEqual(runtime.get('probe').data, edits ? changed : data)
    assert.equal(runtime.revision, edits ? 1 : 0)
    assert.equal(commits.length, edits ? 1 : 0)
    assert.equal(runtime.canUndo, edits)
    assert.equal(JSON.stringify(input), inputBefore)
    if (edits) {
      const after = runtime.save().blocks
      changed.rows[0].cells[0].text = 'retained caller mutation'
      assert.deepEqual(runtime.save().blocks, after)
      assert.equal(runtime.undo(), true)
      assert.deepEqual(runtime.save().blocks, before)
      assert.equal(runtime.redo(), true)
      assert.deepEqual(runtime.save().blocks, after)
    }
    return { size, fields: size * size, command, ...counts }
  } finally { runtime.destroy() }
}

const rows = []
for (const size of [2, 20]) for (const command of ['public-change', 'public-noop-empty', 'public-noop-equal', 'projection-change', 'projection-noop']) {
  const [before, after] = variants.map(variant => run(variant, size, command))
  rows.push({ size, fields: size * size, command, baseline: before, candidate: after,
    avoidedJsonRecordVisits: before.jsonRecordVisits - after.jsonRecordVisits,
    avoidedTablePayloadVisits: before.tablePayloadVisits - after.tablePayloadVisits })
}
for (const variant of variants) assert.deepEqual(await sourceHashes(variant.root), variant.hashes, 'Source changed during observation')
const result = {
  kind: 'Deterministic JSON-boundary work with input detachment, no-op, canonical data and history controls',
  limits: 'Headless Table schema/runtime/public path. Counts exclude setup, assertions and Undo/Redo; no latency, native DOM, RAM, retained heap or leak claim.',
  node: process.version, runnerSha256: hash(await readFile(new URL(import.meta.url))),
  expectedReduction,
  sources: variants.map(({ label, root, head, hashes }) => ({ label, root, head, hashes })),
  sourceUnchanged: true, rows,
}
const json = JSON.stringify(result, null, 2) + '\n'
if (output) await writeFile(resolve(output), json)
else process.stdout.write(json)
for (const row of rows) {
  if (expectedReduction === 'all' || row.command.endsWith('-change')) {
    assert(row.avoidedJsonRecordVisits > 0 && row.avoidedTablePayloadVisits > 0,
      `${row.size}x${row.size} ${row.command}: no avoided payload work`)
  } else {
    // A journal-only optimization cannot change no-op work: no journal
    // entry exists. Keep these controls exact instead of requiring a gain.
    assert.equal(row.avoidedJsonRecordVisits, 0, 'No-op JSON work changed')
    assert.equal(row.avoidedTablePayloadVisits, 0, 'No-op payload work changed')
  }
}
