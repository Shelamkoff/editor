// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { createFontSizeTool } from './fontSize.js'

class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.children = []
    this.childNodes = this.children
    this.parentNode = null
    this.parentElement = null
    this.dataset = {}
    this.style = { display: '', fontSize: '', removeProperty() {} }
    this.classList = { add() {}, toggle() {} }
    this.attributes = []
    this.isConnected = true
    this.offsetParent = {}
    this.firstChild = null
    this._attrs = new Map()
    this._listeners = new Map()
    this._toolbar = null
  }

  setAttribute(name, value) {
    this._attrs.set(name, String(value))
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
      this.dataset[key] = String(value)
    }
  }

  getAttribute(name) { return this._attrs.get(name) ?? null }
  removeAttribute(name) { this._attrs.delete(name) }

  appendChild(child) {
    child.parentNode = this
    child.parentElement = this
    this.children.push(child)
    this.firstChild ??= child
    return child
  }

  append(...children) {
    for (const child of children) this.appendChild(child)
  }

  addEventListener(type, listener) { this._listeners.set(type, listener) }
  removeEventListener(type) { this._listeners.delete(type) }
  querySelectorAll() { return [] }
  querySelector() { return null }
  closest(selector) { return selector === '.oe-inline-toolbar' ? this._toolbar : null }
  contains(node) { return node === this || this.children.some(child => child.contains?.(node)) }
  remove() { this.isConnected = false }
  focus() {}
  select() {}
}

test('font size UI uses the mounted toolbar realm for DOM, listeners and animation frames', () => {
  const created = []
  const listeners = new Map()
  let scheduled = 0
  let cancelled = null
  const ownerWindow = {
    getSelection() { return null },
    requestAnimationFrame() { scheduled++; return 73 },
    cancelAnimationFrame(id) { cancelled = id },
  }
  const ownerDocument = {
    defaultView: ownerWindow,
    createElement(tag) {
      created.push(tag)
      return new FakeElement(tag, ownerDocument)
    },
    addEventListener(type, listener) { listeners.set(type, listener) },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
  }

  const toolbar = ownerDocument.createElement('div')
  const button = ownerDocument.createElement('button')
  button._toolbar = toolbar
  toolbar.appendChild(button)

  const anchor = ownerDocument.createElement('div')
  anchor.setAttribute('contenteditable', 'true')
  anchor.getRootNode = () => ownerDocument
  const range = {
    startContainer: anchor,
    startOffset: 0,
    cloneRange() { return this },
  }
  const cbs = { range }
  const tool = createFontSizeTool('Font size', cbs)

  const names = ['document', 'window', 'Node', 'Document', 'HTMLElement', 'requestAnimationFrame', 'cancelAnimationFrame']
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const poison = new Proxy({}, { get(_target, key) { throw new Error(`ambient ${String(key)} must not be used`) } })
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: poison })
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: poison })
    Object.defineProperty(globalThis, 'Node', { configurable: true, writable: true, value: poison })
    Object.defineProperty(globalThis, 'Document', { configurable: true, writable: true, value: poison })
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, writable: true, value: poison })
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true, writable: true, value() { throw new Error('ambient requestAnimationFrame must not be used') },
    })
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true, writable: true, value() { throw new Error('ambient cancelAnimationFrame must not be used') },
    })

    tool.onMount(button)
    assert.ok(listeners.has('mousedown'))
    assert.ok(created.includes('input'))
    assert.ok(created.includes('li'))

    tool.toggle(null)
    assert.equal(scheduled, 1)
    assert.equal(tool.isDropdownOpen(), true)

    tool.destroy()
    assert.equal(cancelled, 73)
    assert.equal(listeners.has('mousedown'), false)
  } finally {
    for (const name of names) {
      const descriptor = descriptors.get(name)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
})
