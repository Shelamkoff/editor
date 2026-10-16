// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { InlinePopupHost } from '../../core/InlinePopupHost.js'
import { createMentionPlugin } from './index.js'

class Element {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.childNodes = []
    this.style = { removeProperty() {}, setProperty() {} }
    this.classList = { add() {}, remove() {}, toggle() {} }
    this.attributes = new Map()
    this.scrollHeight = 24
    this.scrollWidth = 24
    this.isRoot = false
    this.textContent = ''
  }
  get isConnected() { return this.isRoot || Boolean(this.parentNode?.isConnected) }
  get children() { return this.childNodes }
  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true
    }
    return false
  }
  appendChild(child) {
    child.remove()
    this.childNodes.push(child)
    child.parentNode = this
    return child
  }
  replaceChildren(...children) {
    for (const child of [...this.childNodes]) child.remove()
    for (const child of children) this.appendChild(child)
  }
  remove() {
    if (!this.parentNode) return
    const children = this.parentNode.childNodes
    children.splice(children.indexOf(this), 1)
    this.parentNode = null
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)) }
  getAttribute(key) { return this.attributes.get(key) ?? null }
  removeAttribute(key) { this.attributes.delete(key) }
  addEventListener() {}
  querySelector() { return null }
  getBoundingClientRect() {
    return { left: 10, top: 20, bottom: 40, width: 24, height: 20 }
  }
}

function fixture() {
  const pendingTimers = new Map()
  let timerId = 0
  const ownerDocument = {
    defaultView: {
      HTMLElement: Element,
      Node: Element,
      AbortController,
      innerWidth: 1000,
      innerHeight: 800,
      addEventListener() {},
      setTimeout(callback) {
        const id = ++timerId
        pendingTimers.set(id, callback)
        return id
      },
      clearTimeout(id) { pendingTimers.delete(id) },
    },
    documentElement: { clientWidth: 1000 },
    createElement() { return new Element(ownerDocument) },
    addEventListener() {},
    removeEventListener() {},
  }
  const root = ownerDocument.createElement('div')
  root.isRoot = true
  const anchor = ownerDocument.createElement('p')
  root.appendChild(anchor)
  const host = new InlinePopupHost({ root })
  const controller = new AbortController()
  const runtime = createMentionPlugin({ debounceDelay: 20 }).setup({
    ownerDocument,
    signal: controller.signal,
    t: (_key, fallback) => fallback,
    showPopup: (field, content, cleanup) => host.showPopup('mention', field, content, cleanup),
  })
  return { root, anchor, host, controller, runtime, pendingTimers }
}

test('builtin Mention refreshes search without handing a connected popup back to the host', () => {
  const { root, anchor, host, controller, runtime, pendingTimers } = fixture()
  try {
    for (const query of ['', 'a', 'ab', 'a']) {
      runtime.onTriggerQuery({ anchor, query })
      assert.equal(root.children.length, 2, 'exactly one popup belongs to Mention')
      assert.equal(anchor.getAttribute('aria-expanded'), 'true')
      assert.equal(pendingTimers.size, 1, 'the previous debounced search is retired')
    }
    runtime.onTriggerCancel()
    assert.equal(root.children.length, 1)
    assert.equal(anchor.getAttribute('aria-expanded'), null)
    assert.equal(pendingTimers.size, 0)
  } finally {
    runtime.destroy()
    host.destroy()
    controller.abort()
  }
})

test('Mention replacement does not retain a stale presentation during teardown', () => {
  const { root, anchor, host, controller, runtime } = fixture()
  try {
    runtime.onTriggerQuery({ anchor, query: '' })
    const former = root.children[1]
    runtime.onTriggerQuery({ anchor, query: 'second' })
    assert.notEqual(root.children[1], former, 'the successor owns a fresh surface')
    assert.equal(former.isConnected, false)
    assert.equal(root.children.length, 2)
  } finally {
    runtime.destroy()
    host.destroy()
    controller.abort()
  }
  assert.equal(root.children.length, 1)
})
