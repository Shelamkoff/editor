// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import { UndoManager } from './UndoManager.js'

function createEvents() {
  return {
    on() {
      return () => {}
    },
  }
}

test('history deduplicates documents and restores shared block snapshots', () => {
  const firstBlock = {
    id: 'a',
    type: 'paragraph',
    data: { text: 'first' },
  }
  const secondBlock = {
    id: 'b',
    type: 'paragraph',
    data: { text: 'second' },
  }
  const initial = {
    time: 1,
    version: '1',
    blocks: [firstBlock],
  }
  const changed = {
    time: 2,
    version: '1',
    blocks: [firstBlock, secondBlock],
  }
  let current = initial
  let restored = null

  const manager = new UndoManager(
    { save: () => current.blocks },
    createEvents(),
    () => current,
    data => {
      restored = data
      current = data
    },
    () => null,
    { maxStack: 10, debounceMs: 0 },
  )

  assert.equal(manager.canUndo, false)

  current = changed
  manager.commit()
  assert.equal(manager.canUndo, true)

  // Equal content with fresh object identities must still deduplicate.
  current = structuredClone(changed)
  manager.commit()
  manager.undo()

  assert.deepEqual(restored, initial)
  assert.equal(manager.canRedo, true)

  manager.redo()
  assert.deepEqual(restored, changed)

  manager.destroy()
})

test('commits capture the current document synchronously and in order', () => {
  const initial = {
    time: 1,
    version: '1',
    blocks: [{ id: 'a', type: 'paragraph', data: { text: 'initial' } }],
  }
  const changed = {
    time: 2,
    version: '1',
    blocks: [{ id: 'a', type: 'paragraph', data: { text: 'changed' } }],
  }
  let current = initial
  let restored = null

  const manager = new UndoManager(
    { save: () => current.blocks },
    createEvents(),
    () => current,
    data => { restored = data },
    () => null,
    { maxStack: 10, debounceMs: 0 },
  )

  current = changed
  manager.commit()

  manager.undo()
  assert.deepEqual(restored, initial)
  manager.destroy()
})

test('undo reconciles an uncommitted inline state before reverting structural history', () => {
  const initial = {
    time: 1,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'origin' } }],
  }
  const inserted = {
    time: 2,
    version: '1',
    blocks: [
      ...initial.blocks,
      { id: 'added', type: 'paragraph', data: { text: 'added' } },
    ],
  }
  const formatted = {
    time: 3,
    version: '1',
    blocks: [
      initial.blocks[0],
      { id: 'added', type: 'paragraph', data: { text: '<b>added</b>' } },
    ],
  }
  let current = initial
  let restored = null

  const manager = new UndoManager(
    { save: () => current.blocks },
    createEvents(),
    () => current,
    data => {
      restored = data
      current = data
    },
    () => null,
    { maxStack: 10, debounceMs: 300 },
  )

  current = inserted
  manager.commit()

  // Simulate a synchronous/custom inline mutation whose final history event
  // was not delivered. Undo must capture it at the command boundary instead
  // of removing the previously inserted block.
  current = formatted
  manager.undo()
  assert.deepEqual(restored, inserted)
  assert.equal(restored.blocks.some(block => block.id === 'added'), true)

  manager.redo()
  assert.deepEqual(restored, formatted)
  manager.destroy()
})

test('nested batches commit only at the outer transaction boundary', () => {
  const initial = {
    time: 1,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'origin' } }],
  }
  const firstInnerState = {
    time: 2,
    version: '1',
    blocks: [...initial.blocks, { id: 'first', type: 'paragraph', data: { text: 'first' } }],
  }
  const finalState = {
    time: 3,
    version: '1',
    blocks: [...firstInnerState.blocks, { id: 'second', type: 'paragraph', data: { text: 'second' } }],
  }
  let current = initial
  let restored = null

  const manager = new UndoManager(
    { save: () => current.blocks },
    createEvents(),
    () => current,
    data => {
      restored = data
      current = data
    },
    () => null,
    { maxStack: 10, debounceMs: 0 },
  )

  manager.beginBatch()
  current = firstInnerState
  manager.beginBatch()
  manager.endBatch()
  assert.equal(manager.canUndo, false, 'inner batch committed before the outer operation ended')

  current = finalState
  manager.endBatch()
  assert.equal(manager.canUndo, true)
  manager.undo()
  assert.deepEqual(restored, initial)
  manager.redo()
  assert.deepEqual(restored, finalState)

  manager.destroy()
})

test('destroy prevents later history commits', () => {
  const initial = {
    time: 1,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'origin' } }],
  }
  let captures = 0
  const manager = new UndoManager(
    { save: () => initial.blocks },
    createEvents(),
    () => { captures++; return initial },
    () => {},
    () => null,
    { maxStack: 10, debounceMs: 0 },
  )

  assert.equal(captures, 1, 'initial snapshot was not captured')
  manager.destroy()
  manager.commit()

  assert.equal(captures, 1)
})

test('failed restore keeps undo and redo stacks unchanged', () => {
  const initial = {
    time: 1,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'origin' } }],
  }
  const changed = {
    time: 2,
    version: '1',
    blocks: [...initial.blocks, { id: 'added', type: 'paragraph', data: { text: 'added' } }],
  }
  let current = initial
  let rejectRestore = true
  let restored = null

  const manager = new UndoManager(
    { save: () => current.blocks },
    createEvents(),
    () => current,
    data => {
      if (rejectRestore) throw new Error('render failed')
      restored = data
      current = data
    },
    () => null,
    { maxStack: 10, debounceMs: 0 },
  )

  current = changed
  manager.commit()
  assert.throws(() => manager.undo(), /render failed/)
  assert.equal(manager.canUndo, true)
  assert.equal(manager.canRedo, false)

  rejectRestore = false
  manager.undo()
  assert.deepEqual(restored, initial)
  assert.equal(manager.canRedo, true)
  manager.destroy()
})
