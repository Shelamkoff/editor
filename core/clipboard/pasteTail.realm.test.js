// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { takePasteTail } from './pasteTail.js'

test('paste tail reads selection and creates DOM in the block owning document', () => {
  const field = {
    contentEditable: 'true',
    nodeType: 1,
    childNodes: [],
    parentElement: null,
    querySelectorAll() { return [] },
    matches(selector) { return selector === '[contenteditable]' },
    closest(selector) { return selector === '[contenteditable]' ? field : null },
    contains() { return true },
  }
  const range = {
    startContainer: field,
    startOffset: 0,
    endContainer: field,
    endOffset: 0,
    deleteContents() {},
    collapse() {},
  }
  const selection = {
    rangeCount: 1,
    getRangeAt() { return range },
    removeAllRanges() {},
    addRange() {},
  }
  const suffix = {
    selectNodeContents() {},
    setStart() {},
    extractContents() { return {} },
  }
  const template = {
    innerHTML: '',
    content: { appendChild() {} },
  }
  const ownerDocument = {
    defaultView: { getSelection() { return selection } },
    createRange() { return suffix },
    createElement(tag) { assert.equal(tag, 'template'); return template },
  }
  field.ownerDocument = ownerDocument
  const block = {
    contentElement: field,
    save() { return { type: 'paragraph', data: {} } },
    markDirty() {},
  }

  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousNode = globalThis.Node
  const previousHTMLElement = globalThis.HTMLElement
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.Node = new Proxy({}, { get() { throw new Error('ambient Node must not be used') } })
  globalThis.HTMLElement = class AmbientHTMLElement {}
  try {
    assert.deepEqual(takePasteTail(block), { html: '', metadata: { type: 'paragraph', data: {} } })
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.Node = previousNode
    globalThis.HTMLElement = previousHTMLElement
  }
})
