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
  const ownerWindow = {
    getSelection() {
      return {
        rangeCount: 1,
        isCollapsed: false,
        getRangeAt() { return range },
        toString() { return 'mixed selection' },
      }
    },
  }
  const editor = {
    ownerDocument: { defaultView: ownerWindow },
    contains(node) { return node === inside },
  }
  const block = { id: 'block' }
  const blocks = { getBlockByChildNode(node) { return node === inside ? block : undefined } }
  const selection = new SelectionManager(editor, blocks)

  assert.equal(selection.getSelection(), null)
})

test('selection reads from the editor owning window instead of the ambient global', () => {
  const inside = { id: 'inside' }
  const range = {
    startContainer: inside,
    endContainer: inside,
    cloneRange() { return this },
  }
  const ownerWindow = {
    getSelection() {
      return {
        rangeCount: 1,
        isCollapsed: false,
        getRangeAt() { return range },
        toString() { return 'owner selection' },
      }
    },
  }
  const previousWindow = globalThis.window
  globalThis.window = {
    getSelection() {
      throw new Error('ambient selection must not be read')
    },
  }
  try {
    const editor = {
      ownerDocument: { defaultView: ownerWindow },
      contains(node) { return node === inside },
    }
    const block = { id: 'block' }
    const blocks = { getBlockByChildNode() { return block } }
    const selection = new SelectionManager(editor, blocks)

    assert.deepEqual(selection.getSelection(), {
      blockId: 'block',
      range,
      text: 'owner selection',
    })
  } finally {
    globalThis.window = previousWindow
  }
})

test('caret restoration creates ranges in the editor owning document', () => {
  const textNode = {
    nodeType: 3,
    data: 'abc',
    textContent: 'abc',
    length: 3,
  }
  const root = {
    nodeType: 1,
    tagName: 'DIV',
    childNodes: [textNode],
    contentEditable: 'true',
    hasAttribute() { return false },
    contains(node) { return node === textNode },
  }
  textNode.parentNode = root
  const calls = []
  const range = {
    setStart(node, offset) { calls.push(['setStart', node, offset]) },
    collapse(value) { calls.push(['collapse', value]) },
  }
  const selection = {
    removeAllRanges() { calls.push(['removeAllRanges']) },
    addRange(value) { calls.push(['addRange', value]) },
  }
  const ownerDocument = {
    defaultView: { getSelection() { return selection } },
    createRange() {
      calls.push(['createRange'])
      return range
    },
  }
  const editor = { ownerDocument }
  const block = { id: 'block', contentElement: root }
  const blocks = { getBlockById() { return block } }
  const previousDocument = globalThis.document
  const previousNode = globalThis.Node
  globalThis.document = {
    createRange() {
      throw new Error('ambient document must not create the range')
    },
  }
  globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 }
  try {
    const manager = new SelectionManager(editor, blocks)
    manager.setCaretToOffset('block', 2)
  } finally {
    globalThis.document = previousDocument
    globalThis.Node = previousNode
  }

  assert.deepEqual(calls, [
    ['createRange'],
    ['setStart', textNode, 2],
    ['collapse', true],
    ['removeAllRanges'],
    ['addRange', range],
  ])
})
