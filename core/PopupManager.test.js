// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { PopupManager } from './PopupManager.js'

class FakePopup {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument
    this.className = ''
    this.style = {}
    this.offsetHeight = 100
    this.children = []
    this.removed = false
  }
  appendChild(child) { this.children.push(child); child.parentElement = this }
  contains(node) { return this.children.includes(node) }
  remove() { this.removed = true }
}

test('popup UI and outside-click listener stay in the editor owning document', async () => {
  const listenerCalls = []
  let observerDisconnected = false
  class OwnerMutationObserver {
    constructor(callback) { this.callback = callback }
    observe(target, options) { listenerCalls.push(['observe', target, options]) }
    disconnect() { observerDisconnected = true }
  }

  const ownerDocument = {
    defaultView: {
      innerHeight: 800,
      MutationObserver: OwnerMutationObserver,
    },
    body: { appendChild() { throw new Error('root should own popup') } },
    createElement(tag) {
      assert.equal(tag, 'div')
      listenerCalls.push(['createElement', tag])
      return new FakePopup(ownerDocument)
    },
    addEventListener(type, handler, capture) {
      listenerCalls.push(['add', type, handler, capture])
    },
    removeEventListener(type, handler, capture) {
      listenerCalls.push(['remove', type, handler, capture])
    },
  }
  const root = {
    ownerDocument,
    appended: null,
    contains(node) { return node === anchor },
    appendChild(node) { this.appended = node },
  }
  const anchor = {
    ownerDocument,
    isConnected: true,
    contains() { return false },
    getBoundingClientRect() {
      return { left: 20, top: 30, right: 40, bottom: 50 }
    },
  }
  const content = { ownerDocument }
  const block = { id: 'block' }
  const blocks = {
    getBlockByChildNode(node) { return node === anchor ? block : undefined },
    getBlockById(id) { return id === block.id ? block : undefined },
  }
  const events = { on() { return () => {} }, emit() {} }
  const manager = new PopupManager(events, 'changed', blocks, {}, () => false)
  manager.setRoot(root)

  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const previousMutationObserver = globalThis.MutationObserver
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.MutationObserver = class { constructor() { throw new Error('ambient observer must not be used') } }
  try {
    manager.showPopup(anchor, content)
    await Promise.resolve()
    assert.ok(root.appended instanceof FakePopup)
    assert.equal(root.appended.style.left, '20px')
    assert.equal(root.appended.style.top, '54px')
    assert.ok(listenerCalls.some(call => call[0] === 'add' && call[1] === 'mousedown' && call[3] === true))
    manager.hidePopup()
    assert.ok(listenerCalls.some(call => call[0] === 'remove' && call[1] === 'mousedown' && call[3] === true))
    assert.equal(observerDisconnected, true)
    assert.equal(root.appended.removed, true)
  } finally {
    manager.destroy()
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    globalThis.MutationObserver = previousMutationObserver
  }
})
