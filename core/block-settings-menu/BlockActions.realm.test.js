// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { BlockActions } from './BlockActions.js'

test('block conversion restores selection through the range owning window', () => {
  const node = { ownerDocument: null, isConnected: true, parentElement: null }
  let currentRange = null
  const ownerSelection = {
    get rangeCount() { return currentRange ? 1 : 0 },
    isCollapsed: true,
    getRangeAt() { return currentRange },
    removeAllRanges() { currentRange = null },
    addRange(range) { currentRange = range },
  }
  const ownerDocument = { defaultView: { getSelection: () => ownerSelection } }
  node.ownerDocument = ownerDocument
  const savedRange = {
    startContainer: node,
    endContainer: node,
    startOffset: 0,
    endOffset: 0,
    collapsed: true,
  }
  const contentElement = { ownerDocument }
  const current = {
    id: 'a',
    type: 'paragraph',
    contentElement,
    element: { contains: candidate => candidate === node },
  }
  let converted = 0
  const replacement = { id: 'b', focus() {} }
  const blocks = {
    getBlockByChildNode: () => current,
    getCurrentIndex: () => 0,
    getBlockByIndex: () => current,
    convert() { converted++; return replacement },
    setCurrentIndex() {},
  }
  const events = { emit() {} }
  const calls = []
  const actions = new BlockActions({
    blocks,
    selection: { setCaretToBlock: (...args) => calls.push(args) },
    blockOps: {},
    plugins: new Map(),
    crossBlockSelection: { range: null },
    events,
    commands: { execute(command) { return command.apply() } },
    defaultBlockType: 'paragraph',
    duplicateBlock() {},
    onClose() {},
    onAfterMove() {},
    getSavedRange: () => savedRange,
  })

  const previousWindow = globalThis.window
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  try {
    actions.convertTo('heading')
  } finally {
    globalThis.window = previousWindow
  }

  assert.equal(currentRange, savedRange)
  assert.equal(converted, 1)
  assert.deepEqual(calls, [['b', 'start']])
})
