import test from 'node:test'
import assert from 'node:assert/strict'
import { InlineToolbar } from './InlineToolbar.js'

class FakeNode {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.children = []
    this.listeners = new Map()
    this.attributes = new Map()
    this.dataset = {}
    this.style = { display: '' }
    this.className = ''
    this.parentElement = null
    this.isConnected = true
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false } }
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove()
      this.children.push(node)
      node.parentElement = this
    }
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentElement = null
    this.children = []
    this.append(...nodes)
  }
  remove() {
    if (!this.parentElement) return
    const index = this.parentElement.children.indexOf(this)
    if (index >= 0) this.parentElement.children.splice(index, 1)
    this.parentElement = null
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  removeAttribute(name) { this.attributes.delete(name) }
  addEventListener(type, fn) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(fn)
    this.listeners.set(type, listeners)
  }
  removeEventListener() {}
  captured(type) { return this.listeners.get(type)?.[0] }
  contains(node) { return node === this || this.children.some(child => child.contains(node)) }
  querySelectorAll() { return [] }
  querySelector() { return null }
  focus() { this.ownerDocument.activeElement = this }
  getBoundingClientRect() { return { width: 40, height: 20, top: 0, left: 0, right: 40, bottom: 20 } }
}

function fixture() {
  let selectionReads = 0
  let nativeReads = 0
  const view = {
    AbortController,
    addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, innerWidth: 1024, innerHeight: 768,
    getSelection() {
      nativeReads++
      throw new Error('retired formatting toolbar read browser selection')
    },
  }
  const doc = {
    defaultView: view,
    createElement(tag) { return new FakeNode(tag, doc) },
    addEventListener() {}, removeEventListener() {},
  }
  const root = doc.createElement('section')
  const runtime = {
    readOnly: false,
    health: 'ready',
    generation: 1,
    revision: 0,
    prepareExtensionValue: callback => callback(),
    canAccessFormattingSelection: () => false,
  }
  const selection = {
    capture() {
      selectionReads++
      throw new Error('retired formatting toolbar captured selection')
    },
  }
  const toolbar = new InlineToolbar({
    root, runtime, registry: {}, reconciler: {}, selection, view: {},
    tools: [{
      type: 'strong', title: 'Bold', icon: '', shortcut: 'Mod+b',
      isActive: () => false,
      toggle() {},
    }],
  })
  const element = root.children.find(node => node.className === 'oe-inline-toolbar')
  const panel = element.children.find(node => node.className === 'oe-inline-toolbar__panel')
  const typeButton = panel.children.find(node => node.className === 'oe-inline-toolbar__type-select')
  const typeMenu = element.children.find(node => node.className === 'oe-inline-toolbar__type-dropdown')
  const controlButton = panel.children.find(node => node.className === 'oe-inline-toolbar__level-select')
  return { root, toolbar, element, typeButton, typeMenu, controlButton,
    get selectionReads() { return selectionReads },
    get nativeReads() { return nativeReads } }
}

test('retired InlineToolbar never consumes Mod+B or borrows detached formatting selection', () => {
  const h = fixture()
  h.toolbar.destroy()
  let prevented = 0
  const handled = h.toolbar.handleShortcut({
    key: 'b', code: 'KeyB', ctrlKey: true, metaKey: false,
    shiftKey: false, altKey: false, defaultPrevented: false,
    preventDefault() { prevented++ },
  })
  assert.equal(handled, false)
  assert.equal(prevented, 0)
  assert.equal(h.nativeReads, 0)
  assert.equal(h.selectionReads, 0)
})

test('retained InlineToolbar dropdown pointer callback does not capture detached selection', () => {
  const h = fixture()
  const mousedown = h.typeButton.captured('mousedown')
  h.toolbar.destroy()
  let prevented = 0
  assert.doesNotThrow(() => mousedown({ preventDefault() { prevented++ } }))
  assert.equal(prevented, 0, 'retired type control canceled a browser mousedown')
  assert.equal(h.selectionReads, 0)
})

test('retained InlineToolbar dropdown keyboard callback leaves browser key untouched', () => {
  const h = fixture()
  const keydown = h.controlButton.captured('keydown')
  h.toolbar.destroy()
  let prevented = 0, stopped = 0
  assert.doesNotThrow(() => keydown({
    key: 'ArrowDown',
    preventDefault() { prevented++ },
    stopPropagation() { stopped++ },
  }))
  assert.equal(prevented, 0)
  assert.equal(stopped, 0)
  assert.equal(h.nativeReads, 0)
})

test('retired InlineToolbar cannot present a detached UI on show or read-only transition', () => {
  const h = fixture()
  h.toolbar.destroy()
  assert.doesNotThrow(() => h.toolbar.show())
  assert.doesNotThrow(() => h.toolbar.setReadOnly(false))
  assert.equal(h.nativeReads, 0)
  assert.equal(h.selectionReads, 0)
  h.toolbar.destroy()
})
