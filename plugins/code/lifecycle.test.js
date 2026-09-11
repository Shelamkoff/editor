// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { Code } from './index.js'

class FakeClassList {
  #values = new Set()
  add(...names) { for (const name of names) this.#values.add(name) }
  remove(...names) { for (const name of names) this.#values.delete(name) }
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
    this.dataset = {}
    this.style = {}
    this.attributes = new Map()
    this.listeners = new Map()
    this.textContent = ''
    this.innerHTML = ''
    this.value = ''
    this.hidden = false
    this.disabled = false
    this.tabIndex = 0
    this.contentEditable = 'inherit'
    this.scrollTop = 0
    this.scrollLeft = 0
    this.selectionStart = 0
    this.selectionEnd = 0
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  hasAttribute(name) { return this.attributes.has(name) }
  removeAttribute(name) { this.attributes.delete(name) }
  addEventListener(type, handler) {
    let handlers = this.listeners.get(type)
    if (!handlers) this.listeners.set(type, handlers = [])
    handlers.push(handler)
  }
  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? []
    const index = handlers.indexOf(handler)
    if (index >= 0) handlers.splice(index, 1)
  }
  dispatch(type, extra = {}) {
    const event = { target: this, currentTarget: this, stopPropagation() {}, preventDefault() {}, ...extra }
    for (const handler of this.listeners.get(type) ?? []) handler(event)
    return event
  }
  appendChild(child) {
    child.remove?.()
    this.children.push(child)
    child.parentNode = this
    child.parentElement = this
    return child
  }
  prepend(child) {
    child.remove?.()
    this.children.unshift(child)
    child.parentNode = this
    child.parentElement = this
    return child
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
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true
    }
    return false
  }
  focus() {}
  scrollIntoView() {}
  querySelector() { return null }
  querySelectorAll() { return [] }
}

test('Code destroy makes a pending copy completion inert', async () => {
  const previous = {
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    navigatorDescriptor: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  }
  const documentListeners = new Map()

  globalThis.HTMLElement = FakeElement
  globalThis.document = {
    createElement: tagName => new FakeElement(tagName),
    addEventListener(type, handler) {
      let handlers = documentListeners.get(type)
      if (!handlers) documentListeners.set(type, handlers = [])
      handlers.push(handler)
    },
    removeEventListener(type, handler) {
      const handlers = documentListeners.get(type) ?? []
      const index = handlers.indexOf(handler)
      if (index >= 0) handlers.splice(index, 1)
    },
  }

  let resolveWrite
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText() { return new Promise(resolve => { resolveWrite = resolve }) },
      },
    },
  })
  let timers = 0
  globalThis.setTimeout = () => { timers++; return 1 }
  globalThis.clearTimeout = () => {}

  try {
    const hljs = {
      getLanguage() { return false },
      highlightAuto() { return { value: 'abc' } },
      highlight() { return { value: 'abc' } },
    }
    const plugin = new Code({ hljs })
    const wrapper = plugin.render(
      { code: 'abc', language: 'auto' },
      { readOnly: false, mutate: operation => operation() },
    )
    const copyButton = wrapper.children[0].children[3]

    copyButton.dispatch('click')
    plugin.destroy(wrapper)
    resolveWrite()
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(copyButton.classList.contains('oe-code-btn--copied'), false)
    assert.equal(timers, 0)
    assert.equal((documentListeners.get('mousedown') ?? []).length, 0)
  } finally {
    globalThis.document = previous.document
    globalThis.HTMLElement = previous.HTMLElement
    if (previous.navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', previous.navigatorDescriptor)
    else delete globalThis.navigator
    globalThis.setTimeout = previous.setTimeout
    globalThis.clearTimeout = previous.clearTimeout
  }
})
