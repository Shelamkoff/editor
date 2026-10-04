import test from 'node:test'
import assert from 'node:assert/strict'

import { KeyboardRouter } from './KeyboardRouter.js'

class FakeRoot {
  listeners = new Map()
  ownerDocument = { defaultView: { AbortController } }
  addEventListener(type, handler) { this.listeners.set(type, handler) }
}

function harness() {
  const root = new FakeRoot()
  const field = { value: '', parentNode: null }
  const owner = { blockId: 'b', fieldKey: 'text', element: field, mode: 'plain-text' }
  const calls = []
  const records = [
    { id: 'a', type: 'paragraph', data: { text: 'A' } },
    { id: 'b', type: 'paragraph', data: { text: 'B' } },
    { id: 'c', type: 'paragraph', data: { text: 'C' } },
  ]
  const runtime = {
    readOnly: false,
    list: () => records.map(record => ({ ...record })),
    get: id => records.find(record => record.id === id),
    isEmpty: id => id === 'empty',
    splitBlock(id, fieldKey, range) { calls.push(['split', id, fieldKey, range]); return 'new' },
    mergeAdjacent(left, right) { calls.push(['merge', left, right]); return true },
    remove(id) { calls.push(['remove', id]) },
    convert(id, target) { calls.push(['convert', id, target]) },
    insert(type, data, index) { calls.push(['insert', type, data, index]); return 'new' },
    undo() { calls.push(['undo']); return true },
    redo() { calls.push(['redo']); return true },
  }
  const registry = { defaultBlockType: 'paragraph', getBlockDefinition() { return {} } }
  const reconciler = {
    resolveEditableTarget(target) { return target === field ? owner : null },
    getEditableField(blockId, fieldKey) { return blockId === 'b' && fieldKey === 'text' ? owner : null },
    getEditableFields(blockId) {
      if (blockId === 'a') return [
        { key: 'first', element: {}, mode: 'rich-text' },
        { key: 'last', element: {}, mode: 'rich-text' },
      ]
      return blockId === 'b' ? [owner] : []
    },
  }
  let bookmark = {
    anchor: { blockId: 'b', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 1 },
  }
  const selection = { capture: () => bookmark }
  const viewCalls = []
  const view = {
    reconcileInteraction() { viewCalls.push(['reconcile']) },
    setCurrent(id) { viewCalls.push(['current', id]) },
    focus(id, target) { viewCalls.push(['focus', id, target]); return true },
    indexOf(id) { return records.findIndex(record => record.id === id) },
  }
  const router = new KeyboardRouter({ root, runtime, registry, reconciler, selection, view })
  const event = (key, extra = {}) => {
    let prevented = false
    return {
      key,
      target: field,
      preventDefault() { prevented = true },
      get prevented() { return prevented },
      ...extra,
    }
  }
  return { router, runtime, calls, viewCalls, event, setBookmark: value => { bookmark = value }, field, records }
}

test('Enter delegates an editable split to one runtime transaction', () => {
  const { router, calls, event } = harness()
  const e = event('Enter')
  router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(calls[0], ['split', 'b', 'text', { start: 1, end: 1 }])
  router.destroy()
})

test('ArrowUp from block start focuses the previous block last editable field', () => {
  const { router, viewCalls, event, setBookmark } = harness()
  setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 0 },
  })
  const e = event('ArrowUp')
  router.handleKeydown(e)

  assert.equal(e.prevented, true)
  assert.deepEqual(viewCalls.slice(-2), [
    ['current', 'a'],
    ['focus', 'a', { fieldKey: 'last', offset: 'end' }],
  ])
  router.destroy()
})

test('Backspace at field start merges with the preceding block', () => {
  const { router, calls, event, setBookmark } = harness()
  setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 0 },
  })
  const e = event('Backspace')
  router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(calls[0], ['merge', 'a', 'b'])
  router.destroy()
})

test('Delete at field end merges the following block', () => {
  const { router, calls, event, setBookmark, field } = harness()
  field.value = 'B'
  setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 1 },
  })
  const e = event('Delete')
  router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(calls[0], ['merge', 'b', 'c'])
  router.destroy()
})

test('Ctrl/Meta Z, Shift+Z and Y route exclusively through canonical history', () => {
  const { router, calls, event } = harness()
  const ctrlUndo = event('z', { ctrlKey: true })
  router.handleKeydown(ctrlUndo)
  const ctrlRedo = event('z', { ctrlKey: true, shiftKey: true })
  router.handleKeydown(ctrlRedo)
  const metaUndo = event('z', { metaKey: true })
  router.handleKeydown(metaUndo)
  const yRedo = event('y', { ctrlKey: true })
  router.handleKeydown(yRedo)

  for (const handled of [ctrlUndo, ctrlRedo, metaUndo, yRedo]) {
    assert.equal(handled.prevented, true)
  }
  assert.deepEqual(calls.slice(0, 4), [['undo'], ['redo'], ['undo'], ['redo']])
  router.destroy()
})

test('already handled plugin keydown events never execute generic structural logic', () => {
  const { router, calls, event } = harness()
  router.handleKeydown(event('Enter', { defaultPrevented: true }))
  assert.deepEqual(calls, [])
  router.destroy()
})
