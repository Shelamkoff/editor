// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { Heading } from './index.js'

class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.children = []
    this.firstChild = null
    this.parentNode = null
    this.dataset = {}
    this.style = { textAlign: '' }
    this.className = ''
    this.textContent = ''
    this.innerHTML = ''
    this._attrs = new Map()
    this.classList = { add() {} }
  }
  setAttribute(name, value) { this._attrs.set(name, String(value)) }
  appendChild(child) {
    this.children.push(child)
    this.firstChild ??= child
    child.parentNode = this
    return child
  }
  replaceWith(node) { this.replacedWith = node }
  focus() { this.focused = true }
}

function createRealm() {
  const created = []
  const range = {
    collapsed: true,
    startContainer: null,
    endContainer: null,
    startOffset: 0,
    endOffset: 0,
    setStart(node, offset) { this.startContainer = node; this.startOffset = offset },
    setEnd(node, offset) { this.endContainer = node; this.endOffset = offset },
    collapse() { this.collapsed = true },
  }
  const selection = {
    rangeCount: 0,
    getRangeAt() { return range },
    removeAllRanges() {},
    addRange() {},
  }
  const ownerWindow = { getSelection() { return selection } }
  const ownerDocument = {
    defaultView: ownerWindow,
    createElement(tag) {
      created.push(tag)
      return new FakeElement(tag, ownerDocument)
    },
    createRange() { return range },
  }
  return { ownerDocument, ownerWindow, selection, created }
}

test('heading element-dependent UI and level changes stay in the heading owning realm', () => {
  const realm = createRealm()
  const heading = new Heading()
  const element = new FakeElement('h2', realm.ownerDocument)

  const names = ['document', 'window']
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const poison = new Proxy({}, { get(_target, key) { throw new Error(`ambient ${String(key)} must not be used`) } })
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: poison })
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: poison })

    const settings = heading.renderSettings(element)
    assert.equal(settings.length, 5)
    assert.ok(settings.every(node => node.ownerDocument === realm.ownerDocument))

    const changed = heading.changeLevel(element, 3)
    assert.equal(changed.tagName, 'H3')
    assert.equal(changed.ownerDocument, realm.ownerDocument)
    assert.equal(element.replacedWith, changed)
  } finally {
    for (const name of names) {
      const descriptor = descriptors.get(name)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
})
