// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { ToolboxBuilder } from './ToolboxBuilder.js'

class ForeignHTMLElement {
  constructor(ownerDocument, tag = 'div') {
    this.ownerDocument = ownerDocument
    this.tagName = tag.toUpperCase()
    this.className = ''
    this.dataset = {}
    this.style = { display: '' }
    this.children = []
    this.attributes = new Map()
    this.listeners = new Map()
    this.textContent = ''
    this.innerHTML = ''
    this.value = ''
    this.classList = { add() {}, remove() {} }
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child }
  append(...children) { for (const child of children) this.appendChild(child) }
  addEventListener(type, handler) { this.listeners.set(type, handler) }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type) }
  focus() { this.ownerDocument.activeElement = this }
  remove() {}
  querySelectorAll(selector) {
    const all = []
    const visit = node => { for (const child of node.children || []) { all.push(child); visit(child) } }
    visit(this)
    if (selector === '.oe-toolbox__item') return all.filter(node => node.className.includes('oe-toolbox__item'))
    if (selector.startsWith('[role="menuitem"]')) {
      return all.filter(node => node.getAttribute?.('role') === 'menuitem' && node.style.display !== 'none')
    }
    return []
  }
  querySelector(selector) {
    if (selector === '.oe-toolbox__label') return this.children.find(node => node.className.includes('oe-toolbox__label')) ?? null
    if (selector === '.oe-toolbox__empty') return this.children.find(node => node.className.includes('oe-toolbox__empty')) ?? null
    return this.querySelectorAll(selector)[0] ?? null
  }
}

test('toolbox keyboard navigation uses its owning document and HTMLElement constructor', () => {
  const ownerDocument = {
    activeElement: null,
    defaultView: { HTMLElement: ForeignHTMLElement },
    createElement(tag) { return new ForeignHTMLElement(ownerDocument, tag) },
  }
  const toolbox = new ForeignHTMLElement(ownerDocument, 'ul')
  const plugins = new Map([
    ['paragraph', { type: 'paragraph', title: 'Paragraph', icon: '<i></i>' }],
    ['heading', { type: 'heading', title: 'Heading', icon: '<i></i>' }],
  ])

  const previousDocument = globalThis.document
  const previousHTMLElement = globalThis.HTMLElement
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.HTMLElement = class AmbientHTMLElement {}
  try {
    const builder = new ToolboxBuilder(toolbox, {
      plugins,
      inlinePlugins: null,
      i18n: { t: key => key },
      filterThreshold: 0,
      onInsertBlock() {},
      onInsertInlinePlugin() {},
      onClose() {},
    })
    const filter = builder.filterInput
    assert.ok(filter)
    filter.listeners.get('keydown')({
      key: 'ArrowDown',
      preventDefault() {},
      stopPropagation() {},
    })
    const first = toolbox.querySelector('[role="menuitem"]:not([style*="display: none"])')
    assert.equal(ownerDocument.activeElement, first)
    builder.destroy()
  } finally {
    globalThis.document = previousDocument
    globalThis.HTMLElement = previousHTMLElement
  }
})
