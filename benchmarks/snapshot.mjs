import { DocumentStore } from '../core/DocumentStore.js'

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
  const blocks = Array.from({ length: size }, (_, index) => ({
    id: `block-${index}`,
    type: 'paragraph',
    dataVersion: 1,
    data: { text: `Paragraph ${index}`, nested: { index } },
  }))
  return new DocumentStore({ version: '2.0.0', blocks })
}

const rows = []
for (const size of SIZES) {
  const store = fixture(size)

  const exportDocument = measure(() => store.export(), 50)
  const createDraft = measure(() => store.createDraft(), 200)
  const oneChanged = measure(iteration => {
    const id = `block-${iteration % size}`
    const current = store.get(id)
    const draft = store.createDraft()
    draft.update(id, {
      ...current,
      data: {
        ...current.data,
        nested: { index: current.data.nested.index, revision: iteration },
      },
    })
    store.commit(draft)
  }, 100)
  const finalDocument = store.export()

  rows.push({
    blocks: size,
    exportP95Ms: exportDocument.p95Ms,
    draftP95Ms: createDraft.p95Ms,
    oneChangedCommitP95Ms: oneChanged.p95Ms,
    jsonKiB: (JSON.stringify(finalDocument).length / 1024).toFixed(1),
  })
}

console.table(rows)
