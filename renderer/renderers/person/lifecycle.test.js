import assert from 'node:assert/strict'
import test from 'node:test'
import { createPersonRenderer } from './index.js'

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase()
    this.className = ''
    this.children = []
    this.offsetWidth = 1000
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child }
  append(...children) { children.forEach(child => this.appendChild(child)) }
}

class FakeResizeObserver {
  static latest = null
  constructor(callback) {
    this.callback = callback
    this.disconnected = false
    FakeResizeObserver.latest = this
  }
  observe() {}
  disconnect() { this.disconnected = true }
  fire() { this.callback() }
}

test('person renderer ignores a queued resize callback after destroy', () => {
  const previousDocument = globalThis.document
  const previousObserver = globalThis.ResizeObserver
  globalThis.document = { createElement: tag => new FakeElement(tag) }
  globalThis.ResizeObserver = FakeResizeObserver
  try {
    const renderer = createPersonRenderer('test', {})
    const wrapper = renderer.render({ data: { persons: [{ name: 'A' }, { name: 'B' }] } }, value => {
      const span = new FakeElement('span')
      span.textContent = value
      return span
    })
    const carouselContainer = wrapper.children[0]
    const list = carouselContainer.children[0]
    const cards = [...list.children]
    assert.equal(cards.length, 2, 'Detached output must already contain both profiles')
    const observer = FakeResizeObserver.latest
    assert.ok(observer)
    renderer.destroy(wrapper)
    assert.equal(observer.disconnected, true)
    Object.defineProperty(carouselContainer, 'offsetWidth', {
      get() { throw new Error('Retired observer read geometry after renderer destruction') },
    })
    observer.fire()
    assert.deepEqual(carouselContainer.children, [list])
    assert.deepEqual(list.children, cards, 'Queued work changed the already rendered profiles')
  } finally {
    globalThis.document = previousDocument
    globalThis.ResizeObserver = previousObserver
    FakeResizeObserver.latest = null
  }
})
