// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { takePasteTail } from './pasteTail.js'

test('paste tail reads selection and creates DOM in the block owning document', () => {
  const field = {
    contentEditable: 'true',
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
  field.nodeType = 1
  field.closest = () => field
  const block = {
    contentElement: field,
    save() { return { type: 'paragraph', data: {} } },
    markDirty() {},
  }

  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    assert.deepEqual(takePasteTail(block), { html: '', metadata: { type: 'paragraph', data: {} } })
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})
