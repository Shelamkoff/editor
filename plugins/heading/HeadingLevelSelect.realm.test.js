// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { createHeadingLevelSelect } from './HeadingLevelSelect.js'

class OwnerHTMLElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.children = []
    this.dataset = {}
    this.style = {}
    this.className = ''
    this.textContent = ''
    this._listeners = new Map()
    this._attrs = new Map()
    this.focused = false
  }
  setAttribute(name, value) { this._attrs.set(name, String(value)) }
  getAttribute(name) { return this._attrs.get(name) ?? null }
  appendChild(child) { this.children.push(child); return child }
  addEventListener(type, listener) { this._listeners.set(type, listener) }
  querySelectorAll() { return this.children }
  contains(node) { return node === this || this.children.includes(node) }
  focus() { this.focused = true }
  get classList() { return { add() {}, toggle() {} } }
}

function createRealm() {
  const documentListeners = new Map()
  const selection = { rangeCount: 0, getRangeAt() { throw new Error('no range') } }
  const ownerWindow = {
    HTMLElement: OwnerHTMLElement,
    getSelection() { return selection },
  }
  const ownerDocument = {
    defaultView: ownerWindow,
    createElement(tag) { return new OwnerHTMLElement(tag, ownerDocument) },
    addEventListener(type, listener) { documentListeners.set(type, listener) },
    removeEventListener(type, listener) {
      if (documentListeners.get(type) === listener) documentListeners.delete(type)
    },
  }
  return { ownerDocument, ownerWindow, documentListeners }
}

test('heading level control keeps DOM, selection and outside listeners in the heading realm', () => {
  const realm = createRealm()
  const element = new OwnerHTMLElement('h2', realm.ownerDocument)
  const plugin = {
    getLevel() { return 2 },
    changeLevel(content) { return content },
  }
  const ctx = {
    mutate(callback) { return callback() },
    suppressSelectionChange() {},
    onContentElementChanged() {},
  }
  const levels = [{ level: 2, key: 'h2', icon: '<b>H2</b>' }]

  const names = ['document', 'window', 'HTMLElement']
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const poison = new Proxy({}, { get(_target, key) { throw new Error(`ambient ${String(key)} must not be used`) } })
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: poison })
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: poison })
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, writable: true, value: poison })

    const group = createHeadingLevelSelect(plugin, element, ctx, (_key, fallback) => fallback, levels)
    const [selectBtn, dropdown] = group.elements
    assert.equal(selectBtn.ownerDocument, realm.ownerDocument)
    assert.equal(dropdown.ownerDocument, realm.ownerDocument)
    assert.equal(realm.documentListeners.has('mousedown'), true)

    selectBtn._listeners.get('click')({ preventDefault() {}, stopPropagation() {} })
    assert.equal(selectBtn.getAttribute('aria-expanded'), 'true')

    group.destroy()
    assert.equal(realm.documentListeners.has('mousedown'), false)
  } finally {
    for (const name of names) {
      const descriptor = descriptors.get(name)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
})
