// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCodePlugin } from './index.js'

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
  constructor(tagName = 'div', ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
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
  dispatch(type, extra = {}) {
    const event = { target: this, currentTarget: this, stopPropagation() {}, preventDefault() {}, ...extra }
    for (const handler of this.listeners.get(type) ?? []) handler(event)
    return event
  }
  append(...children) { for (const child of children) this.appendChild(child) }
  appendChild(child) {
    this.children.push(child)
    child.parentNode = this
    child.parentElement = this
    return child
  }
  focus() {}
}

function createHarness() {
  let resolveWrite
  let timers = 0
  const window = {
    AbortController,
    navigator: {
      clipboard: {
        writeText() { return new Promise(resolve => { resolveWrite = resolve }) },
      },
    },
    setTimeout() { timers += 1; return 1 },
    clearTimeout() {},
  }
  const ownerDocument = {
    defaultView: window,
    createElement: tag => new FakeElement(tag, ownerDocument),
  }
  const definition = createCodePlugin({
    hljs: {
      getLanguage() { return false },
      highlightAuto() { return { value: 'abc' } },
      highlight() { return { value: 'abc' } },
    },
  })
  const runtimeController = new AbortController()
  const runtime = definition.setup({
    ownerDocument,
    signal: runtimeController.signal,
    isDefaultBlock: false,
    t: (_key, fallback = '') => fallback,
  })
  const instanceController = new AbortController()
  const data = { code: 'abc', language: 'auto' }
  const instance = runtime.create(data, {
    ownerDocument,
    signal: instanceController.signal,
    createId: prefix => prefix + '-1',
    getData: () => data,
    updateData() {},
    commitDomMutation(operation) { operation() },
    requestSplit() {},
    requestExit() {},
    isReadOnly: () => false,
  })
  return { instance, runtime, runtimeController, instanceController, resolveWrite: () => resolveWrite(), timers: () => timers }
}

test('Code preserves copy feedback and makes a pending copy completion inert after destroy', async () => {
  const f = createHarness()
  const copyButton = f.instance.element.children[0].children[1]

  copyButton.dispatch('click')
  f.instance.destroy()
  f.resolveWrite()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(copyButton.classList.contains('oe-code-btn--copied'), false)
  assert.equal(f.timers(), 0)
  f.runtime.destroy()
})

test('Code copy success shows feedback and schedules one reset while the instance is live', async () => {
  const f = createHarness()
  const copyButton = f.instance.element.children[0].children[1]

  copyButton.dispatch('click')
  f.resolveWrite()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(copyButton.classList.contains('oe-code-btn--copied'), true)
  assert.equal(f.timers(), 1)
  f.instance.destroy()
  f.runtime.destroy()
})
