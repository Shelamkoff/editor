// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { rangeClipboardContent } from './rangeClipboard.js'

test('range clipboard serialization uses the range owning document', () => {
  const content = {
    appendChild() {},
    querySelectorAll() { return [] },
    querySelector() { return null },
  }
  const template = {
    content,
    innerHTML: '<span>copy</span>',
  }
  const ownerDocument = {
    createElement(tag) {
      assert.equal(tag, 'template')
      return template
    },
    createTreeWalker(root, whatToShow) {
      assert.equal(root, content)
      assert.equal(whatToShow, 4)
      return { nextNode() { return false } }
    },
  }
  const boundary = {
    nodeType: 1,
    ownerDocument,
    parentElement: null,
    closest() { return null },
  }
  const range = {
    startContainer: boundary,
    endContainer: boundary,
    commonAncestorContainer: boundary,
    cloneContents() { return {} },
    toString() { return 'copy' },
  }

  const previousDocument = globalThis.document
  const previousNode = globalThis.Node
  const previousNodeFilter = globalThis.NodeFilter
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.Node = new Proxy({}, { get() { throw new Error('ambient Node must not be used') } })
  globalThis.NodeFilter = new Proxy({}, { get() { throw new Error('ambient NodeFilter must not be used') } })
  try {
    assert.deepEqual(rangeClipboardContent(range, [], {}), {
      text: 'copy',
      html: '<span>copy</span>',
    })
  } finally {
    globalThis.document = previousDocument
    globalThis.Node = previousNode
    globalThis.NodeFilter = previousNodeFilter
  }
})
