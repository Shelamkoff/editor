// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { SelectionManager } from './SelectionManager.js'

test('inline selection is rejected when its range leaves the editor root', () => {
  const inside = { id: 'inside' }
  const outside = { id: 'outside' }
  const range = {
    startContainer: inside,
    endContainer: outside,
    cloneRange() { return this },
  }
  const previousWindow = globalThis.window
  globalThis.window = {
    getSelection() {
      return {
        rangeCount: 1,
        isCollapsed: false,
        getRangeAt() { return range },
        toString() { return 'mixed selection' },
      }
    },
  }
  try {
    const editor = { contains(node) { return node === inside } }
    const block = { id: 'block' }
    const blocks = { getBlockByChildNode(node) { return node === inside ? block : undefined } }
    const selection = new SelectionManager(editor, blocks)

    assert.equal(selection.getSelection(), null)
  } finally {
    globalThis.window = previousWindow
  }
})
