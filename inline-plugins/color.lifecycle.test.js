// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createColorSwatchPlugin } from './color.js'

class FakeElement extends EventTarget {
  constructor(tag, ownerDocument) {
    super()
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.contentEditable = 'inherit'
    this.className = ''
    this.dataset = {}
    this.style = {}
    this.children = []
    this.attributes = new Map()
    this.tabIndex = 0
    this.textContent = ''
  }
  append(...nodes) { this.children.push(...nodes) }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  focus() {}
}

test('color inline widget destroy makes retained listeners inert', () => {
  const ownerDocument = { createElement: tag => new FakeElement(tag, ownerDocument) }
  let popupOpens = 0
  const definition = createColorSwatchPlugin()
  const runtime = definition.setup({
    ownerDocument,
    signal: new AbortController().signal,
    t: (_key, fallback = '') => fallback,
    showPopup() { popupOpens += 1 },
    hidePopup() {},
  })
  const data = { value: '#123456' }
  const instance = runtime.create('color-1', data, {
    id: 'color-1',
    blockId: 'block-1',
    fieldKey: 'text',
    signal: new AbortController().signal,
    getData: () => data,
    updateData() {},
    isReadOnly: () => false,
  })

  instance.destroy()
  instance.element.dispatchEvent(new Event('click'))
  assert.equal(popupOpens, 0)
  runtime.destroy()
})
