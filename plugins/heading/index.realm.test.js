// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { createHeadingPlugin } from './index.js'

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
    this.contentEditable = 'inherit'
    this._attrs = new Map()
  }
  setAttribute(name, value) { this._attrs.set(name, String(value)) }
  appendChild(child) {
    this.children.push(child)
    this.firstChild = this.children[0] ?? null
    child.parentNode = this
    return child
  }
  replaceWith(node) {
    const parent = this.parentNode
    if (!parent) return
    const index = parent.children.indexOf(this)
    if (index >= 0) parent.children[index] = node
    node.parentNode = parent
    parent.firstChild = parent.children[0] ?? null
    this.parentNode = null
  }
  focus() { this.focused = true }
}

function createRealm() {
  const created = []
  const ownerDocument = {
    createElement(tag) {
      created.push(tag)
      return new FakeElement(tag, ownerDocument)
    },
  }
  return { ownerDocument, created }
}

test('heading projection and level changes stay in the heading owning realm', () => {
  const realm = createRealm()
  const definition = createHeadingPlugin()
  const runtime = definition.setup({
    ownerDocument: realm.ownerDocument,
    signal: new AbortController().signal,
    isDefaultBlock: false,
    t: (_key, fallback = '') => fallback,
  })
  const data = { text: '', level: 2 }
  const instance = runtime.create(data, {
    ownerDocument: realm.ownerDocument,
    signal: new AbortController().signal,
    createId: prefix => prefix + '-1',
    getData: () => data,
    updateData() {},
    commitDomMutation(operation) { operation() },
    requestSplit() {},
    requestExit() {},
    isReadOnly: () => false,
  })

  assert.equal(instance.element.firstChild.tagName, 'H2')
  assert.equal(instance.element.firstChild.ownerDocument, realm.ownerDocument)

  const next = definition.capabilities.settings.apply(data, 'h3', { createId: prefix => prefix + '-1' })
  instance.update(next, data)

  assert.equal(instance.element.firstChild.tagName, 'H3')
  assert.equal(instance.element.firstChild.ownerDocument, realm.ownerDocument)
  assert.deepEqual(realm.created, ['div', 'h2', 'h3'])

  instance.destroy(); runtime.destroy()
})
