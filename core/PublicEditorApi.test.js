// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorBlocksApi, EditorEventSubscriptions, EditorHandle } from './PublicEditorApi.js'
import { EventBus } from '@shelamkoff/event-bus'
import { EditorEvent } from './editorEvents.js'

function createBlocks() {
  const items = [
    { id: 'first', selected: false },
    { id: 'second', selected: false },
  ]

  return {
    items,
    getSelectedBlocks() { return items.filter(block => block.selected) },
    clearSelection() { for (const block of items) block.selected = false },
    *[Symbol.iterator]() { yield* items },
  }
}

test('EditorBlocksApi emits selection changes from public selection commands', () => {
  const blocks = createBlocks()
  const selectedPayloads = []
  const events = new EventBus()
  events.on(EditorEvent.BLOCK_SELECTED, payload => selectedPayloads.push(payload))
  const api = new EditorBlocksApi(blocks, events)

  api.selectBlocks(['second', 'missing'])
  assert.deepEqual(selectedPayloads, [{ blockIds: ['second'] }])

  api.selectBlocks(['second'])
  assert.equal(selectedPayloads.length, 1, 'an unchanged selection must not emit')

  api.clearSelection()
  assert.deepEqual(selectedPayloads.at(-1), { blockIds: [] })

  api.clearSelection()
  assert.equal(selectedPayloads.length, 2, 'clearing an empty selection must not emit')
})

test('EditorHandle exposes history state and preserves the documented destroyed state', () => {
  let ready = true
  let undoCalls = 0
  let redoCalls = 0
  const facade = {
    get isReady() { return ready },
    get canUndo() { return true },
    get canRedo() { return false },
    undo() { undoCalls += 1; return true },
    redo() { redoCalls += 1; return false },
    destroy() { ready = false },
  }
  const editor = new EditorHandle(facade)

  assert.equal(editor.canUndo, true)
  assert.equal(editor.canRedo, false)
  assert.equal(editor.undo(), true)
  assert.equal(editor.redo(), false)
  assert.equal(undoCalls, 1)
  assert.equal(redoCalls, 1)

  editor.destroy()
  assert.equal(editor.isReady, false)
  editor.destroy()
  assert.throws(() => editor.canUndo, /Editor instance is destroyed/)
  assert.throws(() => editor.undo(), /Editor instance is destroyed/)
})

test('public block moves use final indices and moved events expose final positions', () => {
  const moves = []
  const blocks = {
    getBlockCount() { return 3 },
    move(from, to) { moves.push([from, to]) },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() {},
  }
  const events = new EventBus()
  const api = new EditorBlocksApi(blocks, events)
  const subscriptions = new EditorEventSubscriptions(events)
  const payloads = []
  subscriptions.on(EditorEvent.BLOCK_MOVED, payload => payloads.push(payload))

  api.move(0, 1)
  api.move(2, 0)
  api.move(1, 1)
  api.move(0, 3)

  assert.deepEqual(moves, [[0, 2], [2, 0], [0, 3]])
  assert.throws(() => api.move(0.5, 1), RangeError)

  events.emit(EditorEvent.BLOCK_MOVED, { blockId: 'a', from: 0, to: 2 })
  events.emit(EditorEvent.BLOCK_MOVED, { blockId: 'a', from: 2, to: 0 })
  assert.deepEqual(payloads, [
    { blockId: 'a', from: 0, to: 1 },
    { blockId: 'a', from: 2, to: 0 },
  ])
})

test('public focus rejects out-of-range indices before they reach the block manager', () => {
  const focused = []
  let currentIndex = 0
  const blocks = {
    getBlockCount() { return 2 },
    getCurrentIndex() { return currentIndex },
    setCurrentIndex(index) { currentIndex = index; focused.push(index) },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() {},
  }
  const api = new EditorBlocksApi(blocks, new EventBus())

  api.setCurrentIndex(1)
  assert.deepEqual(focused, [1])
  assert.throws(() => api.setCurrentIndex(-1), /out of range/)
  assert.throws(() => api.setCurrentIndex(2), /out of range/)
  assert.throws(() => api.setCurrentIndex(1.5), /safe integer/)
  assert.deepEqual(focused, [1])
})

test('public removal transfers focused state when the current block changes', () => {
  const first = { id: 'first', focused: false, selected: false }
  const second = { id: 'second', focused: true, selected: false }
  const third = { id: 'third', focused: false, selected: false }
  const items = [first, second, third]
  let currentIndex = 1
  const blocks = {
    getBlockByIndex(index) { return items[index] },
    getCurrentBlock() { return items[currentIndex] },
    remove(index) {
      items.splice(index, 1)
      currentIndex = Math.min(currentIndex, items.length - 1)
    },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() { yield* items },
  }
  const events = new EventBus()
  const focused = []
  events.on(EditorEvent.BLOCK_FOCUSED, ({ blockId }) => focused.push(blockId))
  const api = new EditorBlocksApi(blocks, events)

  api.remove(1)

  assert.equal(second.focused, false)
  assert.equal(third.focused, true)
  assert.deepEqual(focused, ['third'])
})

test('public focus is idempotent for the current index', () => {
  const calls = []
  const blocks = {
    getBlockCount() { return 1 },
    getCurrentIndex() { return 0 },
    setCurrentIndex(index) { calls.push(index) },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() {},
  }
  const api = new EditorBlocksApi(blocks, new EventBus())
  api.setCurrentIndex(0)
  assert.deepEqual(calls, [])
})
