// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { extractBlockElements } from './pasteUtils.js'

test('paste block extraction creates synthetic wrappers in the container document', () => {
  const created = []
  const paragraph = {
    innerHTML: '',
    appendChild(node) { this.innerHTML += node.textContent ?? '' },
  }
  const ownerDocument = {
    createElement(tag) {
      assert.equal(tag, 'template')
      created.push(tag)
      return {
        set innerHTML(_value) {},
        content: { firstElementChild: { ...paragraph } },
      }
    },
  }
  const text = { nodeType: 3, textContent: 'hello', cloneNode() { return { ...this } } }
  const container = { ownerDocument, nodeType: 11, children: [], childNodes: [text] }

  const previousDocument = globalThis.document
  const previousNode = globalThis.Node
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.Node = new Proxy({}, { get() { throw new Error('ambient Node constants must not be used') } })
  try {
    const blocks = extractBlockElements(container)
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].tag, 'p')
    assert.equal(blocks[0].element.innerHTML, 'hello')
  } finally {
    globalThis.document = previousDocument
    globalThis.Node = previousNode
  }
  assert.ok(created.length >= 2)
})
