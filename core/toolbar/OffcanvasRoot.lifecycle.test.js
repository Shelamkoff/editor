// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

class FakeElement {
  constructor() {
    this.className = ''
    this.dataset = {}
    this.parentNode = null
    this.childNodes = []
    this.attributes = new Map()
    this.classes = new Set()
    this.style = { setProperty() {} }
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name),
    }
  }
  appendChild(child) {
    child.remove()
    this.childNodes.push(child)
    child.parentNode = this
    return child
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value))
    if (name === 'data-editor-id') this.dataset.editorId = String(value)
  }
  addEventListener() {}
  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.childNodes
    const index = siblings.indexOf(this)
    if (index >= 0) siblings.splice(index, 1)
    this.parentNode = null
  }
}

const body = new FakeElement()
globalThis.document = {
  body,
  createElement() { return new FakeElement() },
  querySelector(selector) {
    const match = selector.match(/^\.oe-offcanvas-root\[data-editor-id="([^"]+)"\]$/)
    if (!match) return null
    return body.childNodes.find(node => node.dataset.editorId === match[1]) ?? null
  },
}
globalThis.getComputedStyle = () => ({ getPropertyValue() { return '' } })

const frames = []
globalThis.requestAnimationFrame = callback => {
  frames.push(callback)
  return frames.length
}

const { OffcanvasRoot } = await import('./OffcanvasRoot.js')

test('hide invalidates a queued backdrop show frame', () => {
  body.childNodes.length = 0
  frames.length = 0
  const offcanvas = new OffcanvasRoot(new FakeElement(), () => {})

  offcanvas.showBackdrop()
  const root = offcanvas.getRoot()
  const backdrop = root.childNodes[0]
  assert.ok(backdrop)

  offcanvas.hideBackdrop()
  frames.shift()?.()

  assert.equal(backdrop.classList.contains('oe-offcanvas-backdrop--visible'), false)
  offcanvas.destroy()
})
