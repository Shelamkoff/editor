import test from 'node:test'
import assert from 'node:assert/strict'
import { createCarouselPlugin } from './index.js'

// Exercise the public settings-panel capability, not a copied render routine.
// Signal-aware DOM controls faithfully model browser addEventListener lifetimes.
class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.className = ''
    this.dataset = {}
    this._value = ''
    this.selected = false
    this.textContent = ''
    this.listeners = new Map()
  }
  get value() {
    return this.tagName === 'SELECT'
      ? this.children.find(item => item.selected)?.value ?? ''
      : this._value
  }
  set value(next) {
    if (this.tagName === 'SELECT') {
      for (const child of this.children) child.selected = child.value === next
    } else this._value = String(next)
  }
  append(...children) {
    for (const child of children) {
      child.remove()
      child.parentNode = this
      this.children.push(child)
    }
  }
  appendChild(child) { this.append(child); return child }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null
    this.children = []
    this.append(...children)
  }
  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.children
    const index = siblings.indexOf(this)
    if (index >= 0) siblings.splice(index, 1)
    this.parentNode = null
  }
  addEventListener(type, listener, options = {}) {
    if (options.signal?.aborted) return
    const callbacks = this.listeners.get(type) ?? []
    callbacks.push(listener)
    this.listeners.set(type, callbacks)
    options.signal?.addEventListener('abort', () => {
      const current = this.listeners.get(type) ?? []
      const index = current.indexOf(listener)
      if (index >= 0) current.splice(index, 1)
    }, { once: true })
  }
  dispatch(type) {
    for (const callback of [...(this.listeners.get(type) ?? [])]) {
      callback({ type, target: this, preventDefault() {}, stopPropagation() {} })
    }
  }
}
function fixture() {
  const document = {
    createElement(tag) { return new FakeElement(tag, document) },
  }
  let data = {
    slides: [
      { id: 'first', type: 'image', src: 'https://example.com/first.png', caption: 'Alpha', alt: 'First image' },
      { id: 'second', type: 'image', src: 'https://example.com/second.png', caption: 'Bravo', alt: 'Second image' },
    ],
    options: { autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, loop: false, thumbnails: false },
  }
  const settings = createCarouselPlugin({ injectStyles: false }).capabilities.settings.render({
    ownerDocument: document,
    t: ({ fallback }) => fallback,
    getData: () => data,
    updateData(producer) { data = producer(structuredClone(data)) },
  })
  const descend = root => {
    const nodes = []
    const walk = parent => {
      for (const item of parent.children) { nodes.push(item); walk(item) }
    }
    walk(root)
    return nodes
  }
  const selector = () => descend(settings).find(item => item.tagName === 'SELECT')
  const altInput = () => {
    const label = descend(settings).find(item =>
      item.tagName === 'LABEL' && item.children.some(child => child.tagName === 'SPAN'
        && child.textContent === 'Alternative text'))
    return label?.children.find(child => child.tagName === 'INPUT')
  }
  return { data: () => data, settings, selector, altInput }
}

test('Carousel retired slide metadata input cannot mutate another slide', () => {
  const panel = fixture()
  const stale = panel.altInput()
  assert.equal(stale.value, 'First image')
  panel.selector().value = 'second'
  panel.selector().dispatch('change')
  assert.equal(panel.altInput().value, 'Second image')
  assert.notEqual(panel.altInput(), stale)
  stale.value = 'Unwanted stale value'
  stale.dispatch('change')
  assert.equal(panel.data().slides[0].alt, 'First image',
    'a retired metadata control mutated its old slide')
  assert.equal(panel.data().slides[1].alt, 'Second image')
})

test('Carousel active metadata input works after a slide switch and old inputs retire on commit', () => {
  const panel = fixture()
  panel.selector().value = 'second'
  panel.selector().dispatch('change')
  const active = panel.altInput()
  active.value = 'Revised second'
  active.dispatch('change')
  assert.deepEqual(panel.data().slides.map(slide => slide.alt), ['First image', 'Revised second'])
  assert.equal(panel.altInput().value, 'Revised second')
  active.value = 'Late retired edit'
  active.dispatch('change')
  assert.deepEqual(panel.data().slides.map(slide => slide.alt), ['First image', 'Revised second'])
})
