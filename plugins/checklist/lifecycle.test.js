// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { Checklist } from './index.js'

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
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase()
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
    this.children.push(node)
    node.parentNode = this
    node.parentElement = this
    return node
  }
  querySelector() { return null }
  querySelectorAll() { return [] }
  focus() {}
}

test('Checklist destroy makes retained checkbox controls inert', () => {
  const previous = { document: globalThis.document, HTMLElement: globalThis.HTMLElement }
  globalThis.HTMLElement = FakeElement
  globalThis.document = { createElement: tag => new FakeElement(tag) }
  try {
    let mutations = 0
    const plugin = new Checklist()
    const wrapper = plugin.render(
      { items: [{ text: '', checked: false }] },
      {
        readOnly: false,
        mutate(operation) { mutations += 1; return operation() },
        splitBlock() {},
        exitEmptyBlock() { return false },
      },
    )
    const checkbox = wrapper.children[0].children[0]
    plugin.destroy?.(wrapper)
    checkbox.dispatch('click')
    assert.equal(mutations, 0)
  } finally {
    globalThis.document = previous.document
    globalThis.HTMLElement = previous.HTMLElement
  }
})
