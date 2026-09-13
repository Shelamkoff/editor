// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { ActionsPanel } from './ActionsPanel.js'
import { InlinePositioner } from './InlinePositioner.js'

test('inline positioner reads selection from the editor owning window', () => {
  const range = {
    getBoundingClientRect() { return { left: 120, top: 100, bottom: 120, width: 40 } },
  }
  const ownerDocument = {
    defaultView: {
      getSelection() { return { rangeCount: 1, getRangeAt() { return range } } },
    },
  }
  const root = {
    ownerDocument,
    getBoundingClientRect() { return { left: 20, top: 10, width: 400 } },
  }
  const toolbar = { offsetHeight: 40, offsetWidth: 200, style: {} }
  const previousWindow = globalThis.window
  globalThis.window = { getSelection() { throw new Error('ambient selection must not be used') } }
  try {
    new InlinePositioner(toolbar, root).position()
  } finally {
    globalThis.window = previousWindow
  }
  assert.equal(toolbar.style.left, '120px')
  assert.equal(toolbar.style.top, '90px')
})

test('actions panel saves and restores selection in the editor owning window', () => {
  class OwnerHTMLElement {}
  const editingHost = new OwnerHTMLElement()
  editingHost.focusCalls = 0
  editingHost.focus = function () { this.focusCalls++ }
  editingHost.closest = function (selector) { return selector === '[contenteditable="true"]' ? this : null }

  const start = { nodeType: 3, parentElement: editingHost }
  const end = { nodeType: 3, parentElement: editingHost }
  const savedRange = { startContainer: start, endContainer: end }
  const liveRange = {
    startContainer: start,
    endContainer: end,
    cloneRange() { return savedRange },
  }
  const calls = []
  const selection = {
    rangeCount: 1,
    getRangeAt() { return liveRange },
    removeAllRanges() { calls.push('remove') },
    addRange(range) { calls.push(range) },
  }
  const ownerDocument = {
    defaultView: {
      getSelection() { return selection },
      HTMLElement: OwnerHTMLElement,
    },
  }
  const root = {
    ownerDocument,
    contains(node) { return node === start || node === end },
  }
  const panelEl = { remove() {} }
  const panel = new ActionsPanel({
    rootEl: root,
    events: {},
    crossBlockSelection: { range: null },
    tooltip: { show() {}, hide() {} },
    updateActiveStates() {},
    hideTypeSelector() {},
    mutate(_range, operation) { return operation() },
    onClosed() {},
  })
  const previousWindow = globalThis.window
  globalThis.window = { getSelection() { throw new Error('ambient selection must not be used') } }
  try {
    assert.equal(panel.open({ renderActions() { return panelEl } }), panelEl)
    panel.close()
  } finally {
    globalThis.window = previousWindow
  }
  assert.deepEqual(calls, ['remove', savedRange])
  assert.equal(editingHost.focusCalls, 1)
})
