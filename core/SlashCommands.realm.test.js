// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { SlashCommands } from './SlashCommands.js'

class FakeClassList { add() {} remove() {} }
class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.style = {}
    this.children = []
    this.classList = new FakeClassList()
    this.parentElement = null
    this.textContent = ''
    this.innerHTML = ''
    this.offsetHeight = 0
    this.offsetWidth = 240
    this.listeners = new Map()
    this.contentEditable = 'false'
    this.scrollHeight = 0
    this.clientHeight = 0
  }
  setAttribute() {}
  addEventListener(type, handler) { this.listeners.set(type, handler) }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type) }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child }
  contains(node) { return node === this || this.children.some(child => child.contains(node)) }
  scrollIntoView() {}
  remove() {}
  closest(selector) {
    if (selector === '[contenteditable="true"]' && this.contentEditable === 'true') return this
    return null
  }
  getBoundingClientRect() { return { top: 0, bottom: 20, left: 0, right: 100, height: 20 } }
}

test('slash command DOM, selection, scheduling and scroll stay in the editor realm', () => {
  const calls = []
  const textNode = { data: 'hello/abc', length: 9 }
  const selection = { removeAllRanges() { calls.push('selection.clear') }, addRange() { calls.push('selection.add') } }
  const viewListeners = new Map()
  const view = {
    innerHeight: 800,
    innerWidth: 1200,
    NodeFilter: { SHOW_TEXT: 4 },
    getSelection() { calls.push('selection.get'); return selection },
    requestAnimationFrame(callback) { calls.push('raf'); this.frame = callback; return 7 },
    cancelAnimationFrame(id) { calls.push(['cancel', id]) },
    addEventListener(type, handler) { viewListeners.set(type, handler); calls.push(['view.add', type]) },
    removeEventListener(type, handler) { if (viewListeners.get(type) === handler) viewListeners.delete(type); calls.push(['view.remove', type]) },
  }
  const ownerDocument = {
    defaultView: view,
    documentElement: {},
    createElement(tag) { calls.push(['create', tag]); return new FakeElement(tag, ownerDocument) },
    createTreeWalker() {
      calls.push('walker')
      let done = false
      return { currentNode: null, nextNode() { if (done) return false; done = true; this.currentNode = textNode; return true } }
    },
    createRange() {
      calls.push('range')
      return {
        setStart() {}, setEnd() {}, deleteContents() { calls.push('delete') }, collapse() {},
        getClientRects() { return [] },
        getBoundingClientRect() { return { top: 0, bottom: 20, left: 0, right: 10, height: 20 } },
      }
    },
  }
  const root = new FakeElement('div', ownerDocument)
  root.contains = () => true
  const content = new FakeElement('p', ownerDocument)
  content.contentEditable = 'true'
  content.textContent = 'hello/'
  const block = { id: 'b', type: 'paragraph', element: new FakeElement('div', ownerDocument), contentElement: content }
  const blocks = {
    getCurrentBlock() { return block },
    getBlockById(id) { return id === block.id ? block : undefined },
    getBlockByChildNode(node) { return node === content ? block : undefined },
  }
  const inlineRegistry = {
    size: 1,
    values() { return [{ type: 'mention', title: 'Mention', icon: '<i></i>' }] },
  }
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    NodeFilter: globalThis.NodeFilter,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.NodeFilter = new Proxy({}, { get() { throw new Error('ambient NodeFilter must not be used') } })
  globalThis.requestAnimationFrame = () => { throw new Error('ambient rAF must not be used') }
  globalThis.cancelAnimationFrame = () => { throw new Error('ambient cancelAnimationFrame must not be used') }

  const slash = new SlashCommands(root, {
    plugins: new Map([['paragraph', { type: 'paragraph', title: 'Paragraph', icon: '<i></i>' }]]),
    blocks,
    selection: {},
    events: { emit() {} },
    commands: { runForBlock(_block, operation) { return operation() } },
    i18n: { t() { return '' } },
    inlinePluginRegistry: inlineRegistry,
    inlinePluginCtx: {},
  })

  try {
    root.listeners.get('input')({ target: content })
    assert.equal(slash.isOpen, true)
    assert.ok(calls.includes('raf'))
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'view.add' && call[1] === 'scroll'))

    content.textContent = 'hello/abc'
    root.listeners.get('keydown')({
      key: 'Escape', target: content,
      preventDefault() {}, stopPropagation() {},
    })
    assert.ok(calls.includes('walker'))
    assert.ok(calls.includes('range'))
    assert.ok(calls.includes('selection.get'))
  } finally {
    slash.destroy()
    Object.assign(globalThis, previous)
  }
})
