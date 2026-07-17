// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorBlocksApi, EditorHandle } from './PublicEditorApi.js'
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
  const events = {
    emit(event, payload) {
      if (event === EditorEvent.BLOCK_SELECTED) selectedPayloads.push(payload)
    },
  }
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
