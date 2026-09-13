// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { transferInlineContent } from './transferInlineContent.js'

test('inline metadata transfer parses and walks in the supplied document', () => {
  const text = { data: '{{ref}}', parentElement: null }
  const content = { querySelectorAll() { return [] } }
  const template = {
    content,
    set innerHTML(value) { text.data = value },
    get innerHTML() { return text.data },
  }
  const ownerDocument = {
    createElement(tag) {
      assert.equal(tag, 'template')
      return template
    },
    createTreeWalker(root, whatToShow) {
      assert.equal(root, content)
      assert.equal(whatToShow, 4)
      let done = false
      return {
        currentNode: text,
        nextNode() {
          if (done) return false
          done = true
          this.currentNode = text
          return true
        },
      }
    },
  }

  const previousDocument = globalThis.document
  const previousNodeFilter = globalThis.NodeFilter
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.NodeFilter = new Proxy({}, { get() { throw new Error('ambient NodeFilter must not be used') } })
  try {
    const result = transferInlineContent(
      '{{ref}}',
      { ref: { type: 'mention', data: { id: '1' } } },
      new Set(),
      ownerDocument,
    )
    assert.equal(result.html, '{{ref}}')
    assert.deepEqual(result.inline, { ref: { type: 'mention', data: { id: '1' } } })
  } finally {
    globalThis.document = previousDocument
    globalThis.NodeFilter = previousNodeFilter
  }
})
