import test from 'node:test'
import assert from 'node:assert/strict'
import { BlockToolbar } from './BlockToolbar.js'

class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentElement = null
    this.children = []
    this.listeners = new Map()
    this.attributes = new Map()
    this.dataset = {}
    this.style = { display: '' }
    this.className = ''
    this.classList = {
      add() {}, remove() {}, toggle() {}, contains() { return false },
    }
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove()
      node.parentElement = this
      this.children.push(node)
    }
  }
  appendChild(node) { this.append(node); return node }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null
    this.children = []
    this.append(...nodes)
  }
  remove() {
    const parent = this.parentElement
    if (!parent) return
    const index = parent.children.indexOf(this)
    if (index >= 0) parent.children.splice(index, 1)
    this.parentElement = null
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  removeAttribute(name) { this.attributes.delete(name) }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? []
    handlers.push(handler)
    this.listeners.set(type, handlers)
  }
  removeEventListener() {}
  captured(type) { return this.listeners.get(type)?.[0] }
  contains(node) {
    return this === node || this.children.some(child => child.contains(node))
  }
  querySelectorAll() { return [] }
  querySelector() { return null }
  focus() { this.ownerDocument.activeElement = this }
  getBoundingClientRect() {
    return { top: 10, bottom: 40, left: 0, right: 500, width: 500, height: 30 }
  }
  getAnimations() { return [] }
}

function fixture() {
  const win = {
    AbortController,
    addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, innerWidth: 1200, innerHeight: 800,
  }
  const document = {
    defaultView: win,
    createElement(tag) { return new FakeElement(tag, document) },
    addEventListener() {}, removeEventListener() {},
  }
  const root = document.createElement('main')
  const block = document.createElement('section')
  root.append(block)
  const reads = []
  const selection = {
    capture() {
      reads.push('capture')
      return null
    },
  }
  const runtime = {
    readOnly: false, generation: 1, revision: 0,
    get(id) { return id === 'a' ? { id: 'a' } : undefined },
  }
  const registry = {
    blockTypes: [], inlineTypes: [],
    getBlockDefinition() { return null },
  }
  const view = { element(id) { return id === 'a' ? block : null } }
  const toolbar = new BlockToolbar({
    root, runtime, registry, view, selection,
    translate: (_key, fallback) => fallback,
  })
  toolbar.showFor('a')
  const toolbarNode = root.children.find(node => node.className === 'oe-toolbar')
  const toolbox = root.children.find(node => node.className === 'oe-toolbox')
  const settings = root.children.find(node => node.className === 'oe-settings-menu')
  return { root, block, toolbar, toolbarNode, toolbox, settings, reads }
}

test('BlockToolbar cannot reopen toolbox or settings after destroy', () => {
  const h = fixture()
  h.toolbar.destroy()
  const before = h.reads.length
  assert.doesNotThrow(() => h.toolbar.openToolbox())
  assert.doesNotThrow(() => h.toolbar.openSettings())
  assert.equal(h.reads.length, before, 'retired toolbar read the author selection')
  assert.equal(h.toolbox.style.display, 'none')
  assert.equal(h.settings.style.display, 'none')
})

test('retained toolbar button callbacks cannot capture a detached author selection', () => {
  const h = fixture()
  const plus = h.toolbarNode.children[0]
  const settings = h.toolbarNode.children[1]
  const mouseDown = [plus.captured('mousedown'), settings.captured('mousedown')]
  h.toolbar.destroy()
  for (const handler of mouseDown) {
    assert.equal(typeof handler, 'function')
    handler({ button: 0 })
  }
  assert.deepEqual(h.reads, [], 'destroyed toolbar captured an old caret')
})

test('retained toolbar click and menu key callbacks do not consume new host events', () => {
  const h = fixture()
  const plus = h.toolbarNode.children[0]
  const click = plus.captured('click')
  const menuKeydown = h.toolbox.captured('keydown')
  h.toolbar.destroy()
  let stopped = 0, prevented = 0
  assert.doesNotThrow(() => click({
    detail: 1, stopPropagation() { stopped++ },
  }))
  assert.doesNotThrow(() => menuKeydown({
    target: h.toolbox, key: 'Escape',
    preventDefault() { prevented++ },
  }))
  assert.equal(stopped, 0, 'retired button claimed event propagation')
  assert.equal(prevented, 0, 'retired menu claimed host keyboard event')
})
