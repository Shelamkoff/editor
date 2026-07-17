// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import { UndoManager } from './UndoManager.js'

function createEvents() {
  const listeners = new Map()
  return {
    on(type, listener) {
      const values = listeners.get(type) ?? new Set()
      values.add(listener)
      listeners.set(type, values)
      return () => values.delete(listener)
    },
    emit(type, payload) {
      for (const listener of listeners.get(type) ?? []) listener(payload)
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
  assert.equal(manager.undo(), true)

  assert.deepEqual(restored, initial)
  assert.equal(manager.canRedo, true)

  assert.equal(manager.redo(), true)
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

test('history availability reflects pending input before its debounce expires', () => {
  const initial = {
    time: 1,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'origin' } }],
  }
  const changed = {
    time: 2,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'changed' } }],
  }
  const replacement = {
    time: 3,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'replacement' } }],
  }
  const events = createEvents()
  const states = []
  events.on('history:changed', state => states.push(state))
  let current = initial

  const manager = new UndoManager(
    { save: () => current.blocks },
    events,
    () => current,
    data => { current = data },
    () => null,
    { maxStack: 10, debounceMs: 60_000 },
  )

  current = changed
  events.emit('editor:changed')
  assert.equal(manager.canUndo, true)
  assert.equal(manager.canRedo, false)
  assert.deepEqual(states.at(-1), { canUndo: true, canRedo: false })

  assert.equal(manager.undo(), true)
  assert.deepEqual(current, initial)
  assert.equal(manager.canRedo, true)

  current = replacement
  events.emit('editor:changed')
  assert.equal(manager.canRedo, false, 'a pending branch must invalidate redo immediately')
  assert.deepEqual(states.at(-1), { canUndo: true, canRedo: false })

  manager.destroy()
})

test('failed snapshot capture preserves the pending history step and event state', () => {
  const initial = {
    time: 1,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'initial' } }],
  }
  const changed = {
    time: 2,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'changed' } }],
  }
  const events = createEvents()
  const states = []
  events.on('history:changed', state => states.push(state))
  let current = initial
  let rejectCapture = false

  const manager = new UndoManager(
    { save: () => current.blocks },
    events,
    () => {
      if (rejectCapture) throw new Error('capture failed')
      return current
    },
    data => { current = data },
    () => null,
    { maxStack: 10, debounceMs: 60_000 },
  )

  current = changed
  events.emit('editor:changed')
  rejectCapture = true
  assert.throws(() => manager.commit(), /capture failed/)
  assert.equal(manager.canUndo, true, 'failed capture consumed the pending undo step')
  assert.deepEqual(states.at(-1), { canUndo: true, canRedo: false })

  rejectCapture = false
  manager.commit()
  assert.equal(manager.undo(), true)
  assert.deepEqual(current, initial)
  manager.destroy()
})

test('maxStack counts undoable states rather than the current snapshot', () => {
  const initial = {
    time: 1,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'initial' } }],
  }
  const changed = {
    time: 2,
    version: '1',
    blocks: [{ id: 'origin', type: 'paragraph', data: { text: 'changed' } }],
  }
  let current = initial
  const manager = new UndoManager(
    { save: () => current.blocks },
    createEvents(),
    () => current,
    data => { current = data },
    () => null,
    { maxStack: 1, debounceMs: 0 },
  )

  current = changed
  manager.commit()
  assert.equal(manager.canUndo, true)
  assert.equal(manager.undo(), true)
  assert.deepEqual(current, initial)
  assert.equal(manager.undo(), false)
  manager.destroy()
})

test('read-only availability is masked while programmatic changes remain in history', () => {
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
  const events = createEvents()
  const states = []
  events.on('history:changed', state => states.push(state))
  let current = initial

  const manager = new UndoManager(
    { save: () => current.blocks },
    events,
    () => current,
    data => { current = data },
    () => null,
    { maxStack: 10, debounceMs: 0 },
  )

  manager.setCommandsEnabled(false, { notify: false })
  current = changed
  events.emit('editor:willChange')
  events.emit('editor:changed')
  events.emit('history:commit')
  assert.equal(manager.canUndo, false)
  assert.equal(states.some(state => state.canUndo || state.canRedo), false)

  manager.setCommandsEnabled(true, { notify: false })
  assert.equal(manager.canUndo, true, 'recorded read-only changes were discarded')
  assert.equal(manager.undo(), true)
  assert.deepEqual(current, initial)
  manager.destroy()
})
