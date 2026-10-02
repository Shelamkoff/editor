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
