// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { SlashCommands } from './SlashCommands.js'

class FakeClassList {
  add() {}
  remove() {}
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase()
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
  }
  setAttribute() {}
  addEventListener(type, handler) { this.listeners.set(type, handler) }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type) }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child }
  scrollIntoView() {}
  remove() {}
  closest(selector) {
    if (selector.includes('input') && this.tagName === 'INPUT') return this
    if (selector === '[contenteditable="true"]' && this.contentEditable === 'true') return this
    return null
  }
  getBoundingClientRect() { return { top: 0, bottom: 20, left: 0, right: 100, height: 20 } }
}

test('slash commands ignore input events from auxiliary native controls', () => {
  const globals = {
    document: globalThis.document,
    window: globalThis.window,
    NodeFilter: globalThis.NodeFilter,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }
  const textNode = { data: '/', length: 1 }
  globalThis.NodeFilter = { SHOW_TEXT: 4 }
  globalThis.document = {
    documentElement: {},
    createElement(tag) { return new FakeElement(tag) },
    createTreeWalker() {
      let done = false
      return {
        currentNode: null,
        nextNode() {
          if (done) return false
          done = true
          this.currentNode = textNode
          return true
        },
      }
    },
    createRange() {
      return {
        setStart() {},
        setEnd() {},
        getClientRects() { return [] },
        getBoundingClientRect() { return { top: 0, bottom: 20, left: 0, right: 10, height: 20 } },
      }
    },
  }
  globalThis.window = {
    innerHeight: 800,
    innerWidth: 1200,
    addEventListener() {},
    removeEventListener() {},
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}

  const root = new FakeElement('div')
  root.contains = () => true
  const content = new FakeElement('p')
  content.contentEditable = 'true'
  content.textContent = '/'
  const block = { id: 'b', type: 'paragraph', element: new FakeElement('div'), contentElement: content }
  const blocks = {
    getCurrentBlock() { return block },
    getBlockByChildNode(node) { return node === content ? block : undefined },
  }
  const plugin = { type: 'paragraph', title: 'Paragraph', icon: '<i></i>' }
  const slash = new SlashCommands(root, {
    plugins: new Map([['paragraph', plugin]]),
    blocks,
    selection: {},
    events: { emit() {} },
    commands: {},
    i18n: { t() { return '' } },
  })

  try {
    const input = new FakeElement('input')
    root.listeners.get('input')({ target: input })
    assert.equal(slash.isOpen, false)

    root.listeners.get('input')({ target: content })
    assert.equal(slash.isOpen, true)

    let prevented = false
    let stopped = false
    root.listeners.get('keydown')({
      key: 'ArrowDown',
      target: input,
      preventDefault() { prevented = true },
      stopPropagation() { stopped = true },
    })
    assert.equal(prevented, false)
    assert.equal(stopped, false)
  } finally {
    slash.destroy()
    Object.assign(globalThis, globals)
  }
})
