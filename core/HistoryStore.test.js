import test from 'node:test'
import assert from 'node:assert/strict'

import { HistoryStore } from './HistoryStore.js'

function record(id, before = 'a', after = 'b') {
  return {
    id,
    origin: 'user',
    name: 'edit',
    changes: [{
      kind: 'block.update',
      id: 'x',
      before: { id: 'x', type: 'paragraph', data: { text: before } },
      after: { id: 'x', type: 'paragraph', data: { text: after } },
    }],
    selectionBefore: null,
    selectionAfter: null,
  }
}

test('HistoryStore pushes committed records and invalidates redo immediately', () => {
  const history = new HistoryStore({ maxStack: 3 })
  history.push(record(1))
  history.push(record(2))
  assert.equal(history.canUndo, true)
  assert.equal(history.canRedo, false)

  const undo = history.peekUndo()
  assert.equal(undo.id, 2)
  history.commitUndo()
  assert.equal(history.peekRedo().id, 2)

  history.push(record(3))
  assert.equal(history.canRedo, false)
  assert.equal(history.peekUndo().id, 3)
})

test('HistoryStore does not move the cursor until replay commit is explicit', () => {
  const history = new HistoryStore()
  history.push(record(1))
  const pending = history.peekUndo()

  assert.equal(pending.id, 1)
  assert.equal(history.canUndo, true)
  assert.equal(history.canRedo, false)

  // Simulate failed replay by doing nothing.
  assert.equal(history.peekUndo().id, 1)

  history.commitUndo()
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, true)
  assert.equal(history.peekRedo().id, 1)

  history.commitRedo()
  assert.equal(history.canUndo, true)
  assert.equal(history.canRedo, false)
})

test('HistoryStore owns detached immutable transaction data', () => {
  const history = new HistoryStore()
  const source = record(1)
  history.push(source)
  source.changes[0].after.data.text = 'mutated'

  const stored = history.peekUndo()
  assert.equal(stored.changes[0].after.data.text, 'b')

  stored.changes[0].after.data.text = 'consumer'
  assert.equal(history.peekUndo().changes[0].after.data.text, 'b')
})

test('HistoryStore enforces max depth and clears both stacks', () => {
  const history = new HistoryStore({ maxStack: 2 })
  history.push(record(1))
  history.push(record(2))
  history.push(record(3))

  assert.equal(history.peekUndo().id, 3)
  history.commitUndo()
  assert.equal(history.peekUndo().id, 2)
  history.commitUndo()
  assert.equal(history.canUndo, false)

  history.clear()
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)
})

test('HistoryStore coalesces compatible records preserving first before and last after', () => {
  const history = new HistoryStore()
  history.push(record(1, 'a', 'b'))
  history.coalesce(record(2, 'b', 'c'))

  const stored = history.peekUndo()
  assert.equal(stored.id, 2)
  assert.equal(stored.changes.length, 1)
  assert.equal(stored.changes[0].before.data.text, 'a')
  assert.equal(stored.changes[0].after.data.text, 'c')
})

test('prepared history record does not mutate cursor before commit', () => {
  const history = new HistoryStore()
  const prepared = history.prepareRecord(record(1))
  assert.equal(history.canUndo, false)
  assert.deepEqual(prepared.history, { canUndo: true, canRedo: false })
  prepared.commit()
  assert.equal(history.peekUndo().id, 1)
})

test('prepared replay does not move cursor until commit', () => {
  const history = new HistoryStore()
  history.push(record(1))
  const prepared = history.prepareReplay('undo')
  assert.equal(prepared.record.id, 1)
  assert.equal(history.canUndo, true)
  assert.equal(history.canRedo, false)
  prepared.commit()
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, true)
})
test('typing coalescence requires contiguous canonical before and after snapshots', () => {
  const history = new HistoryStore()
  history.push(record(1, 'first', 'second'))
  const stale = history.prepareRecord(record(2, 'unrelated', 'third'), { coalesce: true })
  assert.equal(stale.coalesced, false,
    'an incompatible before snapshot was joined to an earlier history record')
  stale.commit()
  assert.equal(history.undoDepth, 2,
    'nonadjacent changes lost their independent undo boundary')
  history.commitUndo()
  assert.equal(history.peekUndo().changes[0].after.data.text, 'second')
  assert.equal(history.peekRedo().changes[0].before.data.text, 'unrelated')
})

test('typing coalescence compares canonical JSON values without object key order', () => {
  const history = new HistoryStore()
  const earlier = record(1, 'first', 'second')
  earlier.changes[0].after.data.metadata = { a: 1, b: 2 }
  earlier.changes[0].before.data.metadata = { a: 1, b: 2 }
  const later = record(2, 'second', 'third')
  later.changes[0].before.data.metadata = { b: 2, a: 1 }
  later.changes[0].after.data.metadata = { b: 2, a: 1 }
  history.push(earlier)
  const prepared = history.prepareRecord(later, { coalesce: true })
  assert.equal(prepared.coalesced, true,
    'equivalent canonical JSON states should remain one undo gesture')
  prepared.commit()
  assert.equal(history.undoDepth, 1)
  assert.equal(history.peekUndo().changes[0].after.data.text, 'third')
})


test('a prepared record cannot overwrite a later committed record', () => {
  const history = new HistoryStore()
  history.push(record(1))
  const stale = history.prepareRecord(record(2))
  history.push(record(3))
  assert.throws(() => stale.commit(), /stale/i,
    'a prepared history snapshot overwrote a newer committed record')
  assert.equal(history.peekUndo().id, 3)
  assert.equal(history.undoDepth, 2)
  assert.equal(history.redoDepth, 0)

  // A stale plan is never able to commit on a second invocation either.
  assert.throws(() => stale.commit(), /stale/i)
  assert.equal(history.peekUndo().id, 3)
})

test('a prepared Undo cannot restore history after clear', () => {
  const history = new HistoryStore()
  history.push(record(1))
  const pending = history.prepareReplay('undo')
  assert.ok(pending)
  history.clear()
  assert.throws(() => pending.commit(), /stale/i)
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)
  assert.equal(history.undoDepth, 0)
  assert.equal(history.redoDepth, 0)
})

test('a prepared Redo cannot revert a newly committed edit or reintroduce its redo entry', () => {
  const history = new HistoryStore()
  history.push(record(1))
  history.commitUndo()
  const pending = history.prepareReplay('redo')
  assert.ok(pending)
  history.push(record(2))
  assert.equal(history.canRedo, false)
  assert.throws(() => pending.commit(), /stale/i)
  assert.equal(history.peekUndo().id, 2)
  assert.equal(history.undoDepth, 1)
  assert.equal(history.redoDepth, 0)
})

test('a successful prepared history commit is idempotent without invalidating newer plans', () => {
  const history = new HistoryStore()
  const first = history.prepareRecord(record(1))
  first.commit()
  const second = history.prepareRecord(record(2))
  first.commit()
  second.commit()
  assert.equal(history.peekUndo().id, 2)
  assert.equal(history.undoDepth, 2)
})

test('competing prepared replays cannot both advance one history cursor', () => {
  const history = new HistoryStore()
  history.push(record(1))
  const first = history.prepareReplay('undo')
  const second = history.prepareReplay('undo')
  assert.ok(first && second)
  first.commit()
  assert.throws(() => second.commit(), /stale/i)
  assert.equal(history.undoDepth, 0)
  assert.equal(history.redoDepth, 1)
  assert.equal(history.peekRedo().id, 1)
  history.commitRedo()
  assert.equal(history.peekUndo().id, 1)
  assert.equal(history.redoDepth, 0)
})

