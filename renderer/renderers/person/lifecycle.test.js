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
  appendChild(child) { this.children.push(child); return child }
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
    const observer = FakeResizeObserver.latest
    assert.ok(observer)
    renderer.destroy(wrapper)
    assert.equal(observer.disconnected, true)
    observer.fire()
    assert.equal(carouselContainer.children.length, 0)
  } finally {
    globalThis.document = previousDocument
    globalThis.ResizeObserver = previousObserver
    FakeResizeObserver.latest = null
  }
})
