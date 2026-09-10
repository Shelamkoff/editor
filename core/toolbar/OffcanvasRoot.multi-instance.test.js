// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase()
    this.className = ''
    this.dataset = {}
    this.id = ''
    this.parentNode = null
    this.childNodes = []
    this.style = { setProperty() {} }
    this.attributes = new Map()
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
  removeEventListener() {}
  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.childNodes
    const index = siblings.indexOf(this)
    if (index >= 0) siblings.splice(index, 1)
    this.parentNode = null
  }
  classList = { add() {}, remove() {} }
}

const body = new FakeElement('body')
globalThis.document = {
  body,
  createElement(tag) { return new FakeElement(tag) },
  querySelector(selector) {
    if (selector === '.oe-offcanvas-root') {
      return body.childNodes.find(node => node.className.includes('oe-offcanvas-root')) ?? null
    }
    const match = selector.match(/^\.oe-offcanvas-root\[data-editor-id="([^"]+)"\]$/)
    if (!match) return null
    return body.childNodes.find(node => node.dataset.editorId === match[1]) ?? null
  },
}
globalThis.getComputedStyle = () => ({ getPropertyValue() { return '' } })

const { OffcanvasRoot } = await import('./OffcanvasRoot.js')

test('mobile offcanvas roots are isolated across editor instances without explicit ids', () => {
  body.childNodes.length = 0
  const first = new OffcanvasRoot(new FakeElement(), () => {})
  const second = new OffcanvasRoot(new FakeElement(), () => {})

  const firstRoot = first.getRoot()
  const secondRoot = second.getRoot()

  assert.notEqual(firstRoot, secondRoot)
  assert.equal(body.childNodes.length, 2)

  first.destroy()
  assert.equal(secondRoot.parentNode, body)
  second.destroy()
})
