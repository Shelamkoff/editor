// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { restoreSelectionByOffsets } from './textOffset.js'

test('selection offset restoration uses the element owning document', () => {
  const text = { nodeType: 3, textContent: 'abcd', data: 'abcd', length: 4 }
  const element = {
    nodeType: 1,
    tagName: 'DIV',
    childNodes: [text],
    contains(node) { return node === text },
    hasAttribute() { return false },
  }
  text.parentNode = element

  const calls = []
  const range = {
    setStart(node, offset) { calls.push(['start', node, offset]) },
    setEnd(node, offset) { calls.push(['end', node, offset]) },
  }
  const selection = {
    removeAllRanges() { calls.push(['remove']) },
    addRange(value) { calls.push(['add', value]) },
  }
  const ownerDocument = {
    defaultView: { getSelection() { return selection } },
    createRange() { calls.push(['range']); return range },
  }
  element.ownerDocument = ownerDocument

  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousNode = globalThis.Node
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.Node = new Proxy({}, { get() { throw new Error('ambient Node constants must not be used') } })
  try {
    restoreSelectionByOffsets(element, 1, 3)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.Node = previousNode
  }

  assert.deepEqual(calls, [
    ['range'],
    ['start', text, 1],
    ['end', text, 3],
    ['remove'],
    ['add', range],
  ])
})
