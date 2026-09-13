// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { DragManager } from './DragManager.js'

test('drag manager binds document listeners and DOM to the editor document', () => {
  const documentListeners = new Map()
  const handleListeners = new Map()
  const created = []
  const body = { style: {} }
  const ownerDocument = {
    body,
    createElement(tag) {
      created.push(tag)
      return {
        className: '',
        style: {},
        setAttribute() {},
        remove() {},
      }
    },
    addEventListener(type, handler) { documentListeners.set(type, handler) },
    removeEventListener(type, handler) {
      if (documentListeners.get(type) === handler) documentListeners.delete(type)
    },
  }
  const root = {
    ownerDocument,
    appendChild() {},
    getBoundingClientRect() { return { top: 0 } },
  }
  const handle = {
    style: {},
    addEventListener(type, handler) { handleListeners.set(type, handler) },
    removeEventListener(type, handler) {
      if (handleListeners.get(type) === handler) handleListeners.delete(type)
    },
  }
  const block = { id: 'b', element: { classList: { add() {}, remove() {} } } }
  const blocks = {
    getCurrentBlock() { return block },
    getBlockById() { return block },
    getBlockCount() { return 1 },
  }
  const events = { on() { return () => {} }, emit() {} }

  const previousDocument = globalThis.document
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    const manager = new DragManager(root, blocks, handle, events)
    handleListeners.get('mousedown')({
      button: 0,
      clientX: 1,
      clientY: 2,
      preventDefault() {},
      stopPropagation() {},
    })
    assert.equal(documentListeners.has('mousemove'), true)
    assert.equal(documentListeners.has('mouseup'), true)
    manager.destroy()
  } finally {
    globalThis.document = previousDocument
  }

  assert.deepEqual(created, ['div'])
  assert.equal(documentListeners.size, 0)
})
