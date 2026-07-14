import { DocumentSnapshotStore } from '../core/DocumentSnapshotStore.js'

const SIZES = [10, 100, 500, 1000]

function percentile(values, ratio) {
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))]
}

function measure(operation, iterations) {
  const durations = []
  for (let index = 0; index < iterations; index++) {
    const started = performance.now()
    operation(index)
    durations.push(performance.now() - started)
  }
  return {
    medianMs: percentile(durations, 0.5).toFixed(3),
    p95Ms: percentile(durations, 0.95).toFixed(3),
  }
}

function fixture(size) {
  let saveCalls = 0
  const blocks = Array.from({ length: size }, (_, index) => ({
    id: `block-${index}`,
    type: 'paragraph',
    version: 0,
    plugin: { type: 'paragraph', validate: () => true },
    save() {
      saveCalls++
      return {
        id: this.id,
        type: this.type,
        data: { text: `Paragraph ${index}`, nested: { index } },
      }
    },
  }))
  const reader = { [Symbol.iterator]: () => blocks[Symbol.iterator]() }
  const snapshots = new DocumentSnapshotStore(reader, null, {})
  snapshots.capture()
  return { blocks, snapshots, get saveCalls() { return saveCalls } }
}

const rows = []
for (const size of SIZES) {
  const corpus = fixture(size)
  const callsAfterWarmup = corpus.saveCalls
  const cached = measure(() => corpus.snapshots.capture(), 200)
  const publicSave = measure(() => corpus.snapshots.save(), 50)
  const changed = measure((iteration) => {
    corpus.blocks[iteration % corpus.blocks.length].version++
    corpus.snapshots.capture()
  }, 100)
  const finalSnapshot = corpus.snapshots.capture()

  rows.push({
    blocks: size,
    cachedP95Ms: cached.p95Ms,
    publicSaveP95Ms: publicSave.p95Ms,
    oneChangedP95Ms: changed.p95Ms,
    noOpPluginSaves: corpus.saveCalls - callsAfterWarmup - 100,
    jsonKiB: (JSON.stringify(finalSnapshot).length / 1024).toFixed(1),
  })
}

console.table(rows)
