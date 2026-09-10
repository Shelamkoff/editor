// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { SelectionTracker } from './SelectionTracker.js'

test('selection tracker hides when a native range leaves the editor', () => {
  const inside = {}
  const outside = {}
  const range = { startContainer: inside, endContainer: outside }
  const listeners = new Map()
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  globalThis.document = {
    addEventListener(type, handler) { listeners.set(type, handler) },
    removeEventListener() {},
  }
  globalThis.window = {
    getSelection() {
      return {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt() { return range },
        toString() { return 'mixed' },
      }
    },
  }
  let shown = 0
  let hidden = 0
  const root = { addEventListener() {}, removeEventListener() {} }
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
