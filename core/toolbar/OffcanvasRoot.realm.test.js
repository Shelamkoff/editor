// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { OffcanvasRoot } from './OffcanvasRoot.js'

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument
    this.dataset = {}
    this.parentNode = null
    this.childNodes = []
    this.style = { setProperty() {} }
    this.classList = { add() {}, remove() {} }
  }
  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child }
  setAttribute(name, value) { if (name === 'data-editor-id') this.dataset.editorId = String(value) }
  addEventListener() {}
  remove() {
    if (!this.parentNode) return
    const index = this.parentNode.childNodes.indexOf(this)
    if (index >= 0) this.parentNode.childNodes.splice(index, 1)
    this.parentNode = null
  }
}

test('offcanvas portal, styles and delayed lifecycle stay in the editor owning realm', () => {
  const frames = []
  const timers = []
  const body = new FakeElement(null)
  let ownerDocument
  const ownerView = {
    getComputedStyle() { return { getPropertyValue() { return '' } } },
    requestAnimationFrame(callback) { frames.push(callback); return 7 },
    setTimeout(callback, delay) { timers.push([callback, delay]); return 11 },
    clearTimeout() {},
  }
  ownerDocument = {
    defaultView: ownerView,
    body,
    createElement() { return new FakeElement(ownerDocument) },
    querySelector(selector) {
      const match = selector.match(/data-editor-id="([^"]+)"/)
      return match ? body.childNodes.find(node => node.dataset.editorId === match[1]) ?? null : null
    },
  }
  body.ownerDocument = ownerDocument
  const editorRoot = new FakeElement(ownerDocument)

  const previousDocument = globalThis.document
  const previousRaf = globalThis.requestAnimationFrame
  const previousSetTimeout = globalThis.setTimeout
  const previousGetComputedStyle = globalThis.getComputedStyle
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.requestAnimationFrame = () => { throw new Error('ambient rAF must not be used') }
  globalThis.setTimeout = () => { throw new Error('ambient timer must not be used') }
  globalThis.getComputedStyle = () => { throw new Error('ambient styles must not be used') }
  try {
    const offcanvas = new OffcanvasRoot(editorRoot, () => {})
    offcanvas.showBackdrop()
    assert.equal(body.childNodes.length, 1)
    assert.equal(frames.length, 1)
    frames.shift()()
    offcanvas.hideBackdrop()
    assert.equal(timers.length, 1)
    assert.equal(timers[0][1] > 0, true)
    timers[0][0]()
    offcanvas.destroy()
    assert.equal(body.childNodes.length, 0)
  } finally {
    globalThis.document = previousDocument
    globalThis.requestAnimationFrame = previousRaf
    globalThis.setTimeout = previousSetTimeout
    globalThis.getComputedStyle = previousGetComputedStyle
  }
})
