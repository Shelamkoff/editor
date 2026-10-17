import test from 'node:test'
import assert from 'node:assert/strict'
import { createGalleryPlugin } from './index.js'

// Fake owner document with native-style signal-scoped DOM listeners. Only
// public plugin instance/capability behavior is asserted.
class Node {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.className = ''
    this.dataset = {}
    this.attributes = new Map()
    this.style = {}
    this.value = ''
    this.checked = false
    this._text = ''
    this._html = ''
    this.isConnected = true
    this.hidden = false
    this.inert = false
    this.listeners = new Map()
    const self = this
    this.classList = {
      contains(name) { return self.className.split(/\s+/).includes(name) },
      add(...values) {
        const classes = new Set(self.className.split(/\s+/).filter(Boolean))
        for (const value of values) classes.add(value)
        self.className = [...classes].join(' ')
      },
      remove(...values) {
        const classes = new Set(self.className.split(/\s+/).filter(Boolean))
        for (const value of values) classes.delete(value)
        self.className = [...classes].join(' ')
      },
      toggle(name, force) {
        const active = force ?? !this.contains(name)
        if (active) this.add(name)
        else this.remove(name)
        return active
      },
    }
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join('') }
  set textContent(text) {
    this.replaceChildren()
    this._text = String(text)
    this._html = String(text)
  }
  get innerHTML() { return this._html || this.children.map(child => child.innerHTML).join('') }
  set innerHTML(html) {
    this.replaceChildren()
    this._html = String(html)
    this._text = String(html)
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
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
  }
  insertAdjacentHTML() { /* Trusted icons do not affect panel lifecycle. */ }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(item => item.trim())
    const found = []
    const visit = parent => {
      for (const child of parent.children) {
        if (selectors.some(item => item.startsWith('.')
          ? child.className.split(/\s+/).includes(item.slice(1))
          : child.tagName === item.toUpperCase())) found.push(child)
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
function setup() {
  const doc = {
    defaultView: { AbortController, addEventListener() {}, removeEventListener() {} },
    activeElement: null,
    createElement(tag) { return new Node(tag, doc) },
    createTextNode(value) {
      const node = new Node('#text', doc)
      node.textContent = value
      return node
    },
    addEventListener() {},
  }
  const definition = createGalleryPlugin({ injectStyles: false })
  let canonical = {
    ...definition.schema.createDefault(),
    images: [
      { id: 'first', url: 'https://example.test/first.png', caption: '' },
      { id: 'second', url: 'https://example.test/second.png', caption: '' },
    ],
    layout: '1',
    styles: { gap: '8px' },
    options: { ...definition.schema.createDefault().options, captions: true },
  }
  const owner = new AbortController()
  const changes = []
  let instance
  const context = {
    ownerDocument: doc,
    signal: owner.signal,
    isReadOnly: () => false,
    createId: kind => kind + '-1',
    getData: () => canonical,
    updateData(producer) {
      canonical = producer(structuredClone(canonical))
      changes.push(structuredClone(canonical))
      instance?.update(canonical)
    },
  }
  const runtime = definition.setup({ t: (_key, fallback) => fallback })
  instance = runtime.create(canonical, context)
  const form = () => instance.element.querySelector('.oe-gallery__style-form')
  const gapInput = root => root.querySelectorAll('label').find(row =>
    row.children.some(child => child.tagName === 'SPAN' && child.textContent === 'Gap'))
    ?.children.find(child => child.tagName === 'INPUT')
  return {
    definition, doc, owner, instance, form, gapInput,
    model: () => canonical, changes,
    external(next) { canonical = structuredClone(next); instance.update(canonical) },
    standalone() {
      const ctx = {
        ownerDocument: doc,
        t: ({ fallback }) => fallback,
        getData: () => canonical,
        updateData(producer) {
          canonical = producer(structuredClone(canonical))
          changes.push(structuredClone(canonical))
        },
      }
      return definition.capabilities.settings.render(ctx)
    },
    destroy() { instance.destroy(); owner.abort(); runtime.destroy() },
  }
}

test('retired Gallery style input is inert after a full block projection', () => {
  const h = setup()
  try {
    const oldGap = h.gapInput(h.form())
    assert.ok(oldGap)
    h.external({
      ...h.model(),
      images: h.model().images.map(image => image.id === 'second'
        ? { ...image, url: 'https://example.test/changed.png' } : image),
      styles: { gap: '12px' },
    })
    const currentGap = h.gapInput(h.form())
    assert.ok(currentGap && currentGap !== oldGap)
    assert.equal(currentGap.value, '12px')
    oldGap.value = '999px'
    oldGap.fire('change')
    assert.equal(h.model().styles.gap, '12px',
      'retired Gallery style input overwrote the current canonical gap')
    assert.equal(h.changes.length, 0)
    currentGap.value = '16px'
    currentGap.fire('change')
    assert.equal(h.model().styles.gap, '16px',
      'live Gallery settings stopped working after projection')
  } finally { h.destroy() }
})

test('standalone Gallery panel revokes the input it replaced during its own refresh', () => {
  const h = setup()
  try {
    const panel = h.standalone()
    const oldGap = h.gapInput(panel)
    assert.equal(oldGap.value, '8px')
    oldGap.value = '12px'
    oldGap.fire('change')
    assert.equal(h.model().styles.gap, '12px')
    assert.equal(h.changes.length, 1)
    const updatedGap = h.gapInput(panel)
    assert.notEqual(updatedGap, oldGap)
    assert.equal(updatedGap.value, '12px')

    oldGap.value = '999px'
    oldGap.fire('change')
    assert.equal(h.model().styles.gap, '12px',
      'retired standalone Gallery setting remained authoritative')
    assert.equal(h.changes.length, 1)
    updatedGap.value = '20px'
    updatedGap.fire('change')
    assert.equal(h.model().styles.gap, '20px')
    assert.equal(h.changes.length, 2)
  } finally { h.destroy() }
})

test('Gallery settings listeners are revoked with the block owner', () => {
  const h = setup()
  const oldGap = h.gapInput(h.form())
  const originalGap = h.model().styles.gap
  h.destroy()
  oldGap.value = '1000px'
  oldGap.fire('change')
  assert.equal(h.model().styles.gap, originalGap)
  assert.equal(h.changes.length, 0)
})

test('Gallery reprojects an undone caption even when it equals stale local text', () => {
  const h = setup()
  try {
    const caption = () => h.instance.element.querySelector('.oe-gallery__slot-caption')
    const retained = caption()
    assert.ok(retained, 'Gallery fixture has no mounted caption')
    retained.innerHTML = 'Native authored text'
    const beforeUndo = {
      ...h.model(),
      images: h.model().images.map(image => image.id === 'first'
        ? { ...image, caption: 'Native authored text' } : image),
    }
    const restored = structuredClone(h.model())
    h.instance.update(restored, beforeUndo)
    assert.notEqual(caption(), retained,
      'Gallery treated Undo as an unchanged caption by using stale plugin-local data')
    assert.equal(caption()?.innerHTML, '',
      'Gallery model restored empty caption but DOM still displayed native text')
  } finally { h.destroy() }
})

test('Gallery retains the native editing host for a style change after native input', () => {
  const h = setup()
  try {
    const original = h.instance.element.querySelector('.oe-gallery__slot-caption')
    assert.ok(original)
    original.innerHTML = 'Native authored text'
    const committed = {
      ...h.model(),
      images: h.model().images.map(image => image.id === 'first'
        ? { ...image, caption: 'Native authored text' } : image),
    }
    const withStyle = { ...committed, styles: { ...committed.styles, gap: '12px' } }
    h.instance.update(withStyle, committed)
    assert.equal(h.instance.element.querySelector('.oe-gallery__slot-caption'), original,
      'style-only canonical change detached retained native caption')
    assert.equal(original.innerHTML, 'Native authored text')
  } finally { h.destroy() }
})
