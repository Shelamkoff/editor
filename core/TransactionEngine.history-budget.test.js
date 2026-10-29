import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

const block = (id, text = id) => ({ id, type: 'paragraph', dataVersion: 1, data: { text } })
const bookmark = offset => ({
  anchor: { blockId: 'a', fieldKey: 'text', offset },
  focus: { blockId: 'a', fieldKey: 'text', offset },
})

function fixture(maxBytes = 1) {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a'), block('b')] })
  const history = new HistoryStore({ maxBytes })
  const flags = { failApply: false }
  const recovered = []
  const restored = []
  const events = []
  const engine = new TransactionEngine({
    store, history,
    selection: { capture: () => bookmark(1), restore: value => restored.push(value) },
    projector: {
      prepare() {
        return {
          apply() { if (flags.failApply) throw new Error('projection failed') },
          recover() { recovered.push(true) },
          finalize() {}, discard() {},
        }
      },
    },
    onCommit: event => events.push(event),
  })
  const edit = text => engine.execute({ origin: 'external', name: 'block.update' },
    tx => tx.update('a', block('a', text)))
  return { store, history, engine, flags, recovered, restored, events, edit }
}

test('an oversized semantic action keeps all blocks and selection through real history replay', () => {
  const h = fixture()
  h.edit('earlier')
  const before = h.store.export()
  h.engine.execute({ origin: 'user', name: 'compound', selectionAfter: () => bookmark(7) }, tx => {
    tx.update('a', block('a', 'Большой текст 🦎'.repeat(100)))
    tx.update('b', { ...block('b', 'Sibling'), inline: JSON.parse('{"__proto__":{"type":"opaque","dataVersion":9,"data":{"kept":true}}}') })
    tx.insert(2, block('c', 'Inserted'))
  })
  const after = h.store.export()
  assert.equal(h.history.undoDepth, 1)
  assert.equal(h.history.peekUndo().changes.length, 3)
  assert.equal(h.engine.undo(), true)
  assert.deepEqual(h.store.export().blocks, before.blocks)
  assert.deepEqual(h.restored.at(-1), bookmark(1))
  assert.equal(h.history.canUndo, false)
  assert.equal(h.engine.redo(), true)
  assert.deepEqual(h.store.export().blocks, after.blocks)
  assert.deepEqual(h.restored.at(-1), bookmark(7))
  assert.equal(h.history.undoDepth, 1)
  assert.equal(h.events.length, 4)
})

test('failed projection cannot replace or evict the last accepted undo action', () => {
  const h = fixture()
  h.edit('accepted')
  const previous = h.history.peekUndo()
  const revision = h.store.revision
  h.flags.failApply = true
  assert.throws(() => h.edit('rejected'.repeat(10000)), /projection failed/)
  assert.equal(h.store.revision, revision)
  assert.equal(h.store.get('a').data.text, 'accepted')
  assert.deepEqual(h.history.peekUndo(), previous)
  assert.equal(h.events.length, 1)
  assert.equal(h.recovered.length, 1)
  h.flags.failApply = false
  assert.equal(h.engine.undo(), true)
  assert.equal(h.store.get('a').data.text, 'a')
})

test('failed byte capture after projection recovers without changing the model or either history cursor', t => {
  const h = fixture(4096)
  h.edit('first')
  h.edit('second')
  h.engine.undo()
  const before = h.store.export()
  const undo = h.history.peekUndo(), redo = h.history.peekRedo()
  const revision = h.store.revision
  const encode = t.mock.method(TextEncoder.prototype, 'encode', () => { throw new Error('byte capture failed') })
  try {
    assert.throws(() => h.edit('rejected'.repeat(10000)), /byte capture failed/)
  } finally { encode.mock.restore() }
  assert.deepEqual(h.store.export(), before)
  assert.equal(h.store.revision, revision)
  assert.deepEqual(h.history.peekUndo(), undo)
  assert.deepEqual(h.history.peekRedo(), redo)
  assert.equal(h.recovered.length, 1)
  assert.equal(h.engine.redo(), true)
  assert.equal(h.store.get('a').data.text, 'second')
})

test('a canonical no-op does not measure, evict or discard the accepted redo branch', t => {
  const h = fixture(4096)
  h.edit('first')
  h.edit('second')
  h.engine.undo()
  const undo = h.history.peekUndo(), redo = h.history.peekRedo()
  const revision = h.store.revision
  const encode = t.mock.method(TextEncoder.prototype, 'encode', () => { throw new Error('no-op byte traversal') })
  try { h.edit('first') } finally { encode.mock.restore() }
  assert.equal(h.store.revision, revision)
  assert.deepEqual(h.history.peekUndo(), undo)
  assert.deepEqual(h.history.peekRedo(), redo)
  assert.equal(h.events.length, 3)
  assert.equal(h.engine.redo(), true)
  assert.equal(h.store.get('a').data.text, 'second')
})

test('an aborted compound edit preserves the previous whole action and accounting', () => {
  const h = fixture()
  h.edit('accepted')
  const previous = h.history.peekUndo()
  assert.throws(() => h.engine.execute({ origin: 'user', name: 'aborted' }, tx => {
    tx.update('a', block('a', 'large'.repeat(10000)))
    tx.remove('b')
    throw new Error('abort compound')
  }), /abort compound/)
  assert.deepEqual(h.history.peekUndo(), previous)
  assert.equal(h.store.get('a').data.text, 'accepted')
  assert.ok(h.store.get('b'))
  assert.equal(h.engine.undo(), true)
  assert.equal(h.store.get('a').data.text, 'a')
})
