import test from 'node:test'
import assert from 'node:assert/strict'
import { createImagePlugin } from './index.js'

// A signal-aware minimal owning-document fixture. The test observes the
// public mounted Image settings controls and canonical updateData changes.
class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.className = ''
    this.dataset = {}
    this.style = {}
    this.attributes = new Map()
    this.value = ''
    this.checked = false
    this._text = ''
    this._html = ''
    this.hidden = false
    this.inert = false
    this.isConnected = true
    this.listeners = new Map()
    const element = this
    this.classList = {
      contains(name) { return element.className.split(/\s+/).includes(name) },
      add(...names) {
        const classes = new Set(element.className.split(/\s+/).filter(Boolean))
        for (const name of names) classes.add(name)
        element.className = [...classes].join(' ')
      },
      remove(...names) {
        const classes = new Set(element.className.split(/\s+/).filter(Boolean))
        for (const name of names) classes.delete(name)
        element.className = [...classes].join(' ')
      },
      toggle(name, desired) {
        const next = desired ?? !this.contains(name)
        if (next) this.add(name)
        else this.remove(name)
        return next
      },
    }
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join('') }
  set textContent(value) {
    this.replaceChildren()
    this._text = String(value)
    this._html = String(value)
  }
  get innerHTML() { return this._html || this.children.map(child => child.textContent).join('') }
  set innerHTML(value) {
    this.replaceChildren()
    this._html = String(value)
    this._text = String(value)
  }
  append(...children) { for (const child of children) this.appendChild(child) }
  appendChild(child) {
    if (typeof child === 'string') child = this.ownerDocument.createTextNode(child)
    child.remove()
    child.parentNode = this
    child.isConnected = this.isConnected
    this.children.push(child)
    return child
  }
  replaceChildren(...children) {
    for (const child of this.children) {
      child.parentNode = null
      child.isConnected = false
    }
    this.children = []
    this._text = ''
    this._html = ''
    this.append(...children)
  }
  remove() {
    if (this.parentNode) {
      const siblings = this.parentNode.children
      const index = siblings.indexOf(this)
      if (index >= 0) siblings.splice(index, 1)
      this.parentNode = null
    }
    this.isConnected = false
  }
  contains(node) {
    return node === this || this.children.some(child => child.contains(node))
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  removeAttribute(name) { this.attributes.delete(name) }
  addEventListener(type, callback, options = {}) {
    if (options.signal?.aborted) return
    const listeners = this.listeners.get(type) ?? []
    listeners.push(callback)
    this.listeners.set(type, listeners)
    options.signal?.addEventListener('abort', () => {
      const index = listeners.indexOf(callback)
      if (index >= 0) listeners.splice(index, 1)
    }, { once: true })
  }
  fire(type) {
    const event = { type, target: this, preventDefault() {}, stopPropagation() {} }
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event)
  }
  querySelectorAll(selector) {
    const names = selector.split(',').map(value => value.trim())
    const found = []
    const visit = parent => {
      for (const child of parent.children) {
        if (names.some(name => name.startsWith('.')
          ? child.className.split(/\s+/).includes(name.slice(1))
          : child.tagName === name.toUpperCase())) found.push(child)
        visit(child)
      }
    }
    visit(this)
    return found
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
  focus() { this.ownerDocument.activeElement = this }
  getClientRects() { return [] }
  closest() { return null }
}

function mount() {
  const ownerDocument = {
    activeElement: null,
    defaultView: { AbortController },
    createElement(tag) { return new FakeElement(tag, ownerDocument) },
    createTextNode(value) {
      const node = new FakeElement('#text', ownerDocument)
      node.textContent = value
      return node
    },
    addEventListener() {},
  }
  const owner = new AbortController()
  const definition = createImagePlugin({ injectStyles: false })
  let canonical = {
    ...definition.schema.createDefault(),
    file: { url: 'https://example.test/image.png' },
    caption: 'Alpha',
    styles: { height: '100px', borderRadius: '8px' },
  }
  let instance
  const updates = []
  const context = {
    ownerDocument,
    signal: owner.signal,
    isReadOnly: () => false,
    getData: () => canonical,
    createId: () => 'id',
    updateData(producer) {
      canonical = producer(structuredClone(canonical))
      updates.push(structuredClone(canonical))
      instance.update(canonical)
    },
  }
  instance = definition.setup({ t: (_key, fallback) => fallback }).create(canonical, context)
  const control = label => {
    const form = instance.element.querySelector('.oe-image__style-form')
    const row = form.querySelectorAll('label').find(item =>
      item.children.some(child => child.tagName === 'SPAN' && child.textContent === label))
    return row?.children.find(item => item.tagName === 'INPUT' || item.tagName === 'SELECT')
  }
  return {
    ownerDocument,
    instance,
    control,
    model: () => canonical,
    updates,
    external(next) {
      canonical = structuredClone(next)
      instance.update(canonical)
    },
    destroy() { instance.destroy(); owner.abort() },
  }
}

test('Image retired style inputs cannot mutate canonical data after an unrelated repaint', () => {
  const h = mount()
  try {
    const oldHeight = h.control('Height')
    assert.ok(oldHeight)
    h.external({ ...h.model(), styles: { ...h.model().styles, height: '220px' } })
    const currentHeight = h.control('Height')
    assert.notEqual(currentHeight, oldHeight)
    assert.equal(currentHeight.value, '220px')
    oldHeight.value = '999px'
    oldHeight.fire('change')
    assert.equal(h.model().styles.height, '220px',
      'detached Image style field changed canonical data')
    assert.equal(h.updates.length, 0)

    currentHeight.value = '240px'
    currentHeight.fire('change')
    assert.equal(h.model().styles.height, '240px', 'live style control lost its change handler')
    assert.equal(h.updates.length, 1)
  } finally { h.destroy() }
})

test('Image retired switches cannot overwrite active settings after a repaint', () => {
  const h = mount()
  try {
    const oldExpanded = h.control('Expanded')
    assert.ok(oldExpanded)
    h.external({ ...h.model(), expanded: true })
    const currentExpanded = h.control('Expanded')
    assert.notEqual(currentExpanded, oldExpanded)
    assert.equal(currentExpanded.checked, true)
    oldExpanded.checked = false
    oldExpanded.fire('change')
    assert.equal(h.model().expanded, true, 'retired Image switch changed canonical mode')
    currentExpanded.checked = false
    currentExpanded.fire('change')
    assert.equal(h.model().expanded, false, 'live Image switch stopped working')
  } finally { h.destroy() }
})

test('Image settings revoke listeners on block disposal', () => {
  const h = mount()
  const height = h.control('Height')
  const original = h.model().styles.height
  h.destroy()
  height.value = '777px'
  height.fire('change')
  assert.equal(h.model().styles.height, original)
  assert.equal(h.updates.length, 0)
})
