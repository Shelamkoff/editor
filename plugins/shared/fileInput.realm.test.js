// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { triggerFileInput } from './fileInput.js'

test('file input is created and mounted in the supplied owning document', () => {
  const previousDocument = globalThis.document
  globalThis.document = {
    createElement() { throw new Error('ambient document must not be consulted') },
    body: { appendChild() { throw new Error('ambient body must not be consulted') } },
  }
  try {
    let appended = null
    let clicks = 0
    const listeners = new Map()
    const input = {
      type: '', style: {}, accept: '', multiple: false, files: [],
      addEventListener(type, handler) { listeners.set(type, handler) },
      remove() {},
      click() { clicks++ },
    }
    const ownerDocument = {
      createElement(tag) {
        assert.equal(tag, 'input')
        return input
      },
      body: {
        appendChild(node) { appended = node; return node },
      },
    }

    triggerFileInput({ ownerDocument, accept: 'image/*', multiple: true, onFiles() {} })

    assert.equal(appended, input)
    assert.equal(clicks, 1)
    assert.equal(input.accept, 'image/*')
    assert.equal(input.multiple, true)
  } finally {
    globalThis.document = previousDocument
  }
})
