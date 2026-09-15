// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { Block } from './Block.js'

class ForeignHTMLElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.className = ''
    this.dataset = {}
    this.style = { textAlign: '' }
    this.contentEditable = 'false'
    this.tabIndex = -1
    this.textContent = ''
    this.parentNode = null
    this.children = []
    this._attributes = new Map()
    this._query = new Map()
    this._queryAll = new Map()
    this.classList = { toggle() {}, add() {} }
  }
  setAttribute(name, value) { this._attributes.set(name, String(value)) }
  getAttribute(name) { return this._attributes.get(name) ?? null }
  hasAttribute(name) { return this._attributes.has(name) }
  removeAttribute(name) { this._attributes.delete(name) }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child }
  replaceChild(next, previous) {
    const index = this.children.indexOf(previous)
    if (index >= 0) this.children.splice(index, 1, next)
    next.parentNode = this
    previous.parentNode = null
  }
  matches() { return false }
  querySelector(selector) { return this._query.get(selector) ?? null }
  querySelectorAll(selector) { return this._queryAll.get(selector) ?? [] }
  focus() { this.focused = true }
}
class ForeignInput extends ForeignHTMLElement {}
class ForeignTextArea extends ForeignHTMLElement {}
class ForeignButton extends ForeignHTMLElement {}
class ForeignSelect extends ForeignHTMLElement {}

function createRealm() {
  const treeWalkerCalls = []
  const ownerWindow = {
    HTMLElement: ForeignHTMLElement,
    HTMLInputElement: ForeignInput,
    HTMLTextAreaElement: ForeignTextArea,
    HTMLButtonElement: ForeignButton,
    HTMLSelectElement: ForeignSelect,
    NodeFilter: { SHOW_TEXT: 4 },
  }
  const ownerDocument = {
    defaultView: ownerWindow,
    createElement(tag) { return new ForeignHTMLElement(tag, ownerDocument) },
    createTreeWalker(root, whatToShow) {
      treeWalkerCalls.push({ root, whatToShow })
      return { currentNode: null, nextNode() { return false } }
    },
  }
  return { ownerDocument, ownerWindow, treeWalkerCalls }
}

function createBlock(realm, { readOnly = false } = {}) {
  const content = new ForeignHTMLElement('div', realm.ownerDocument)
  const plugin = {
    type: 'probe',
    render() { return content },
    save() { return {} },
  }
  const commands = { runForBlock(_block, operation) { return operation() } }
  return { block: new Block(plugin, commands, {}, 'probe-id', readOnly), content }
}

test('Block accepts plugin DOM from its owning realm without ambient DOM constructors', () => {
  const realm = createRealm()
  const previousDocument = globalThis.document
  const previousHTMLElement = globalThis.HTMLElement
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.HTMLElement = class AmbientHTMLElement {}
  try {
    const { block, content } = createBlock(realm)
    assert.equal(block.contentElement, content)
    assert.equal(block.element.ownerDocument, realm.ownerDocument)
    assert.equal(block.element.children[0], content)
  } finally {
    globalThis.document = previousDocument
    globalThis.HTMLElement = previousHTMLElement
  }
})

test('Block inline scanning and focus use the content owning realm', () => {
  const realm = createRealm()
  const { block, content } = createBlock(realm)
  const focusable = new ForeignHTMLElement('button', realm.ownerDocument)
  content._query.set('[contenteditable="true"]', focusable)

  const previousDocument = globalThis.document
  const previousNodeFilter = globalThis.NodeFilter
  const previousHTMLElement = globalThis.HTMLElement
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.NodeFilter = new Proxy({}, { get() { throw new Error('ambient NodeFilter must not be used') } })
  globalThis.HTMLElement = class AmbientHTMLElement {}
  try {
    assert.equal(block.importInlineContent('plain', undefined), 'plain')
    assert.equal(realm.treeWalkerCalls.length, 1)
    assert.equal(realm.treeWalkerCalls[0].root, content)
    assert.equal(realm.treeWalkerCalls[0].whatToShow, 4)

    block.focus()
    assert.equal(focusable.focused, true)
  } finally {
    globalThis.document = previousDocument
    globalThis.NodeFilter = previousNodeFilter
    globalThis.HTMLElement = previousHTMLElement
  }
})

test('Block read-only enforcement uses control constructors from the content realm', () => {
  const realm = createRealm()
  const input = new ForeignInput('input', realm.ownerDocument)
  const button = new ForeignButton('button', realm.ownerDocument)
  const content = new ForeignHTMLElement('div', realm.ownerDocument)
  content._queryAll.set('[contenteditable]', [])
  content._queryAll.set('input, textarea', [input])
  content._queryAll.set('button, select', [button])
  const plugin = { type: 'probe', render() { return content }, save() { return {} } }
  const commands = { runForBlock(_block, operation) { return operation() } }

  const previous = {
    HTMLElement: globalThis.HTMLElement,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    HTMLSelectElement: globalThis.HTMLSelectElement,
  }
  class Ambient {}
  globalThis.HTMLElement = Ambient
  globalThis.HTMLInputElement = Ambient
  globalThis.HTMLTextAreaElement = Ambient
  globalThis.HTMLButtonElement = Ambient
  globalThis.HTMLSelectElement = Ambient
  try {
    new Block(plugin, commands, {}, 'readonly-id', true)
    assert.equal(input.readOnly, true)
    assert.equal(button.disabled, true)
  } finally {
    Object.assign(globalThis, previous)
  }
})


test('Block passes the editor owning document to plugin render context', () => {
  const realm = createRealm()
  let receivedDocument = null
  const plugin = {
    type: 'probe',
    render(_data, context) {
      receivedDocument = context.ownerDocument
      return realm.ownerDocument.createElement('div')
    },
    save() { return {} },
  }
  const commands = { runForBlock(_block, operation) { return operation() } }

  new Block(plugin, commands, {}, 'owner-id', false, {}, realm.ownerDocument)

  assert.equal(receivedDocument, realm.ownerDocument)
})
