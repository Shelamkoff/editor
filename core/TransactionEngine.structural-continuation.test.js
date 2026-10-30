import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

const block = (source, title = '') => ({
  id: 'asset', type: 'custom-media', dataVersion: 1,
  data: { source, title },
})

function harness(initial, historyOptions) {
  const store = new DocumentStore({ version: '2.0.0', blocks: [initial] })
  const history = new HistoryStore(historyOptions)
  const engine = new TransactionEngine({ store, history })
  const update = (next, baseRevision) => engine.execute({
    origin: 'plugin', name: 'block.update',
    ...(baseRevision === undefined ? {} : {
      continuation: { baseRevision, blockId: 'asset', fieldKey: 'source' },
    }),
  }, tx => tx.update('asset', next))
  return { store, history, engine, update }
}

test('metadata completing an object-valued source edit shares its complete Undo/Redo action', () => {
  const before = block({ url: '/before.png', crop: { x: 0, y: 0 } })
  const authored = block({ url: '/after.png', crop: { x: 10, y: 20 } })
  // The task returns an independently owned object with a different key order.
  const completed = block({ crop: { y: 20, x: 10 }, url: '/after.png' }, 'Loaded image')
  const { store, history, engine, update } = harness(before)

  update(authored)
  update(completed, store.revision)

  assert.deepEqual(store.get('asset'), completed)
  assert.equal(history.undoDepth, 1)
  assert.equal(engine.undo(), true)
  assert.deepEqual(store.get('asset'), before)
  assert.equal(engine.canUndo, false)
  assert.equal(engine.redo(), true)
  assert.deepEqual(store.get('asset'), completed)
})

test('array-valued source completion retains the complete gesture under the newest-action byte exception', () => {
  const before = block([{ url: '/before.png', name: 'Before' }])
  const authored = block([{ url: '/after.png', name: 'After' }, { url: '/second.png', name: 'Second' }])
  const completed = block([{ name: 'After', url: '/after.png' }, { name: 'Second', url: '/second.png' }], 'Loaded images')
  const { store, history, engine, update } = harness(before, { maxBytes: 1 })

  update(authored)
  update(completed, store.revision)

  assert.equal(history.undoDepth, 1)
  assert.equal(engine.undo(), true)
  assert.deepEqual(store.get('asset'), before,
    'byte retention must keep the complete continued action, not just its metadata tail')
  assert.equal(engine.canUndo, false)
  assert.equal(engine.redo(), true)
  assert.deepEqual(store.get('asset'), completed)
})

test('a preceding metadata-only action cannot be adopted through an unchanged object field', () => {
  const before = block({ url: '/same.png', crop: { x: 0, y: 0 } })
  const authored = block({ crop: { y: 0, x: 0 }, url: '/same.png' }, 'Author title')
  const completed = block({ url: '/same.png', crop: { x: 0, y: 0 } }, 'Loaded title')
  const { store, history, engine, update } = harness(before)

  update(authored)
  update(completed, store.revision)

  assert.equal(history.undoDepth, 2)
  assert.equal(engine.undo(), true)
  assert.deepEqual(store.get('asset'), authored)
  assert.equal(engine.undo(), true)
  assert.deepEqual(store.get('asset'), before)
})

test('completion that changes a nested source value remains independently undoable', () => {
  const before = block({ url: '/before.png', crop: { x: 0, y: 0 } })
  const authored = block({ url: '/after.png', crop: { x: 10, y: 20 } })
  const completed = block({ url: '/after.png', crop: { x: 10, y: 21 } }, 'Loaded image')
  const { store, history, engine, update } = harness(before)

  update(authored)
  update(completed, store.revision)

  assert.equal(history.undoDepth, 2)
  assert.equal(engine.undo(), true)
  assert.deepEqual(store.get('asset'), authored)
  assert.equal(engine.undo(), true)
  assert.deepEqual(store.get('asset'), before)
})

test('completion that reorders the source array remains independently undoable', () => {
  const before = block(['/before.png'])
  const authored = block(['/first.png', '/second.png'])
  const completed = block(['/second.png', '/first.png'], 'Loaded images')
  const { store, history, engine, update } = harness(before)

  update(authored)
  update(completed, store.revision)

  assert.equal(history.undoDepth, 2)
  assert.equal(engine.undo(), true)
  assert.deepEqual(store.get('asset'), authored)
  assert.equal(engine.undo(), true)
  assert.deepEqual(store.get('asset'), before)
})
