// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { SelectionTracker } from './SelectionTracker.js'

test('selection tracker hides when an owning-document range leaves the editor', () => {
  const inside = {}
  const outside = {}
  const range = { startContainer: inside, endContainer: outside }
  const listeners = new Map()
  const ownerDocument = {
    defaultView: {
      getSelection() {
        return {
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt() { return range },
          toString() { return 'mixed' },
        }
      },
      requestAnimationFrame(callback) { callback(); return 1 },
    },
    addEventListener(type, handler) { listeners.set(type, handler) },
    removeEventListener() {},
  }
  let shown = 0
  let hidden = 0
  const root = { ownerDocument, addEventListener() {}, removeEventListener() {} }
  const toolbar = { style: { display: 'none' } }
  const block = { id: 'block', hasInlineTools: true }
  const tracker = new SelectionTracker(toolbar, {
    rootEl: root,
    blocks: { getBlockByChildNode(node) { return node === inside ? block : undefined } },
    crossBlockSelection: { range: null },
    show() { shown++ },
    hide() { hidden++ },
    updateActiveStates() {},
    isInActionsView() { return false },
    isTypeSelectorOpen() { return false },
    hasOpenToolDropdown() { return false },
  })

  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  try {
    listeners.get('selectionchange')()
    assert.equal(shown, 0)
    assert.equal(hidden, 1)
  } finally {
    tracker.destroy()
    globalThis.document = previousDocument
    globalThis.window = previousWindow
  }
})


test('selection tracker ignores an owning-window mouseup frame after destroy', () => {
  const documentListeners = new Map()
  const rootListeners = new Map()
  let frame = null
  const ownerDocument = {
    defaultView: {
      getSelection() { return null },
      requestAnimationFrame(callback) { frame = callback; return 1 },
    },
    addEventListener(type, handler) { documentListeners.set(type, handler) },
    removeEventListener() {},
  }

  let shown = 0
  let hidden = 0
  const root = {
    ownerDocument,
    addEventListener(type, handler) { rootListeners.set(type, handler) },
    removeEventListener() {},
  }
  const toolbar = { style: { display: 'none' } }
  const tracker = new SelectionTracker(toolbar, {
    rootEl: root,
    blocks: { getBlockByChildNode() {} },
    crossBlockSelection: { range: {} },
    show() { shown++ },
    hide() { hidden++ },
    updateActiveStates() {},
    isInActionsView() { return false },
    isTypeSelectorOpen() { return false },
    hasOpenToolDropdown() { return false },
  })

  const previousRaf = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = () => { throw new Error('ambient rAF must not be used') }
  try {
    rootListeners.get('mousedown')()
    documentListeners.get('mouseup')()
    assert.equal(typeof frame, 'function')
    tracker.destroy()
    frame()
    assert.equal(shown, 0)
    assert.equal(hidden, 0)
  } finally {
    globalThis.requestAnimationFrame = previousRaf
  }
})
