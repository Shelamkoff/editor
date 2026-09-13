// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { KeyboardManager } from './KeyboardManager.js'


test('select-all uses the editor owning selection and document range', () => {
  const listeners = new Map()
  const documentListeners = new Map()
  const windowListeners = new Map()
  const calls = []
  const nativeRange = {
    setStart(node, offset) { calls.push(['start', node, offset]) },
    setEnd(node, offset) { calls.push(['end', node, offset]) },
  }
  const nativeSelection = {
    isCollapsed: false,
    removeAllRanges() { calls.push(['remove']) },
    addRange(range) { calls.push(['add', range]) },
  }
  const ownerWindow = {
    getSelection() { return nativeSelection },
    addEventListener(type, handler) { windowListeners.set(type, handler) },
    removeEventListener(type, handler) {
      if (windowListeners.get(type) === handler) windowListeners.delete(type)
    },
  }
  const ownerDocument = {
    defaultView: ownerWindow,
    createRange() { calls.push(['create']); return nativeRange },
    addEventListener(type, handler) { documentListeners.set(type, handler) },
    removeEventListener(type, handler) {
      if (documentListeners.get(type) === handler) documentListeners.delete(type)
    },
  }
  const root = {
    ownerDocument,
    addEventListener(type, handler) { listeners.set(type, handler) },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type)
    },
    contains() { return true },
    closest() { return null },
  }
  const firstContent = { childNodes: [{}] }
  const secondContent = { childNodes: [{}, {}] }
  const first = { id: 'a', contentElement: firstContent, selected: false, isEmpty() { return false } }
  const second = { id: 'b', contentElement: secondContent, selected: false, isEmpty() { return false } }
  const blocks = {
    hasSelectedBlocks() { return false },
    getCurrentBlock() { return first },
    getBlockCount() { return 2 },
    getBlockByIndex(index) { return [first, second][index] },
  }
  const manager = new KeyboardManager(
    root,
    {},
    { handle() { return false } },
    blocks,
    { emit(type, payload) { calls.push(['emit', type, payload]) } },
    'paragraph',
  )

  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    listeners.get('keydown')({
      target: root,
      key: 'a',
      code: 'KeyA',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault() { calls.push(['prevent']) },
    })
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    manager.destroy()
  }

  assert.equal(first.selected, true)
  assert.equal(second.selected, true)
  assert.ok(calls.some(call => call[0] === 'create'))
  assert.ok(calls.some(call => call[0] === 'add' && call[1] === nativeRange))
  assert.equal(windowListeners.size, 0)
})
