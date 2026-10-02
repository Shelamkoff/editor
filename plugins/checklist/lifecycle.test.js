// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { createChecklistPlugin } from './index.js'

class FakeClassList {
  #values = new Set()
  add(...names) { names.forEach(name => this.#values.add(name)) }
  remove(...names) { names.forEach(name => this.#values.delete(name)) }
  contains(name) { return this.#values.has(name) }
  toggle(name, force) {
    const next = force === undefined ? !this.#values.has(name) : Boolean(force)
    if (next) this.#values.add(name)
    else this.#values.delete(name)
    return next
  }
}

class FakeElement {
  constructor(tagName = 'div', ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.className = ''
    this.classList = new FakeClassList()
    this.children = []
    this.childNodes = this.children
    this.parentNode = null
    this.parentElement = null
    this.listeners = new Map()
    this.attributes = new Map()
    this.dataset = {}
    this.style = {}
    this.innerHTML = ''
    this.textContent = ''
    this.contentEditable = 'inherit'
    this.type = ''
    this.disabled = false
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  addEventListener(type, handler) {
    let handlers = this.listeners.get(type)
    if (!handlers) this.listeners.set(type, handlers = [])
    handlers.push(handler)
  }
  dispatch(type) {
    const event = { target: this, preventDefault() {}, stopPropagation() {} }
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node) }
  appendChild(node) {
    if (node.parentNode && node.parentNode !== this) node.remove?.()
    if (!this.children.includes(node)) this.children.push(node)
    node.parentNode = this
    node.parentElement = this
    return node
  }
  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.children
    const index = siblings.indexOf(this)
    if (index >= 0) siblings.splice(index, 1)
    this.parentNode = null
    this.parentElement = null
  }
  contains(node) {
    for (let current = node; current; current = current.parentNode) if (current === this) return true
    return false
  }
  querySelector() { return null }
  querySelectorAll() { return [] }
  focus() {}
}

test('Checklist destroy makes retained checkbox controls inert', () => {
  const ownerDocument = { createElement: tag => new FakeElement(tag, ownerDocument) }
  let mutations = 0
  const definition = createChecklistPlugin()
  const runtime = definition.setup({
    ownerDocument,
    signal: new AbortController().signal,
    isDefaultBlock: false,
    t: (_key, fallback = '') => fallback,
  })
  const data = { items: [{ id: 'item-1', text: '', checked: false }] }
  const instance = runtime.create(data, {
    ownerDocument,
    signal: new AbortController().signal,
    createId: prefix => prefix + '-1',
    getData: () => data,
    updateData(producer) { mutations += 1; producer(data) },
    commitDomMutation(operation) { operation() },
    requestSplit() {},
    requestExit() {},
    isReadOnly: () => false,
  })
  const checkbox = instance.element.children[0].children[0]

  instance.destroy()
  checkbox.dispatch('click')
  assert.equal(mutations, 0)
  runtime.destroy()
})
