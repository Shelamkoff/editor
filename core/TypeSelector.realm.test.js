// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { TypeSelector } from './TypeSelector.js'

function createElementFactory(ownerDocument, focused) {
  return function createElement(tag) {
    const listeners = new Map()
    const attrs = new Map()
    const children = []
    const element = {
      ownerDocument,
      tagName: tag.toUpperCase(),
      style: {},
      className: '',
      classList: { add() {}, remove() {} },
      dataset: {},
      children,
      listeners,
      offsetHeight: 0,
      textContent: '',
      innerHTML: '',
      setAttribute(name, value) { attrs.set(name, String(value)) },
      getAttribute(name) { return attrs.get(name) ?? null },
      addEventListener(type, handler) { listeners.set(type, handler) },
      removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type) },
      appendChild(child) { children.push(child); child.parentElement = element; return child },
      append(...nodes) { for (const node of nodes) element.appendChild(node) },
      querySelector(selector) {
        if (selector === '[role="menuitem"]') return children.find(child => child.getAttribute?.('role') === 'menuitem') ?? null
        return null
      },
      querySelectorAll() { return [] },
      getBoundingClientRect() { return { top: 10, bottom: 20 } },
      focus() { focused.count++ },
      remove() {},
    }
    return element
  }
}

test('type selector creates, reads selection and schedules focus in the block owning realm', () => {
  const frames = []
  const focused = { count: 0 }
  const range = { collapsed: true, cloneRange() { return this } }
  let selectionReads = 0
  const ownerWindow = {
    innerHeight: 800,
    getSelection() { selectionReads++; return { rangeCount: 1, getRangeAt: () => range } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length },
  }
  const ownerDocument = { defaultView: ownerWindow }
  ownerDocument.createElement = createElementFactory(ownerDocument, focused)

  const block = { type: 'paragraph', contentElement: { ownerDocument } }
  const blocks = { getCurrentBlock: () => block }
  const plugin = { type: 'paragraph', title: 'Paragraph', icon: '<i></i>' }

  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const previousRaf = globalThis.requestAnimationFrame
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.requestAnimationFrame = () => { throw new Error('ambient rAF must not be used') }
  try {
    const selector = new TypeSelector(
      blocks,
      {},
      new Map([['paragraph', plugin]]),
      { execute(command) { return command.apply() } },
      null,
      { range: null },
      { emit() {} },
      { filterThreshold: 7 },
    )
    const button = selector.selectButton
    button.listeners.get('click')({ preventDefault() {}, stopPropagation() {} })
    assert.equal(selectionReads, 1)
    assert.equal(frames.length, 1)
    frames.shift()()
    assert.equal(focused.count, 1)
    selector.destroy()
  } finally {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    globalThis.requestAnimationFrame = previousRaf
  }
})
