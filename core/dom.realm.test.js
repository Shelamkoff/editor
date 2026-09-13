// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { el, positionPopup } from './dom.js'
import { Tooltip } from './Tooltip.js'
import { handleMenuKeydown } from './menuKeyboardNav.js'
import { CrossBlockSelection } from './CrossBlockSelection.js'
import { rangeStartsAtBeginning, rangeEndsAtEnd } from './splitConvert.js'

test('DOM helpers and tooltip use the supplied/owning document', () => {
  const created = []
  const body = { appendChild(node) { created.push(['append', node]) } }
  const ownerDocument = {
    body,
    defaultView: { innerHeight: 500 },
    createElement(tag) {
      const node = {
        tagName: tag.toUpperCase(),
        ownerDocument,
        className: '',
        style: {},
        setAttribute() {},
        appendChild() {},
        remove() {},
      }
      created.push(['create', tag, node])
      return node
    },
  }
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  try {
    const node = el('div', 'x', undefined, ownerDocument)
    assert.equal(node.ownerDocument, ownerDocument)
    const tooltip = new Tooltip(ownerDocument)
    tooltip.destroy()

    const popup = { ownerDocument, offsetHeight: 100, style: {} }
    positionPopup(popup, { top: 450, bottom: 470 }, { top: 0, bottom: 500 })
    assert.equal(popup.style.bottom, '54px')
  } finally {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
  }
  assert.ok(created.some(entry => entry[0] === 'append'))
})

test('menu keyboard navigation reads activeElement from the menu document', () => {
  let focused = ''
  const first = { focus() { focused = 'first' } }
  const second = { focus() { focused = 'second' } }
  const ownerDocument = { activeElement: first }
  const menu = { ownerDocument, querySelectorAll() { return [first, second] } }
  const previousDocument = globalThis.document
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    assert.equal(handleMenuKeydown({ key: 'ArrowDown', preventDefault() {}, stopPropagation() {} }, menu, { onEscape() {} }), true)
  } finally {
    globalThis.document = previousDocument
  }
  assert.equal(focused, 'second')
})

test('cross-block highlights use the range owning CSS registry and deactivate clears it', () => {
  const calls = []
  class OwnerHighlight {
    constructor(range) { this.range = range }
  }
  const highlights = {
    set(key, value) { calls.push(['set', key, value.range]) },
    delete(key) { calls.push(['delete', key]) },
  }
  const ownerDocument = { defaultView: { Highlight: OwnerHighlight, CSS: { highlights } } }
  const range = { startContainer: { ownerDocument } }
  const previousCSS = globalThis.CSS
  const previousHighlight = globalThis.Highlight
  globalThis.CSS = new Proxy({}, { get() { throw new Error('ambient CSS must not be used') } })
  globalThis.Highlight = class { constructor() { throw new Error('ambient Highlight must not be used') } }
  try {
    const selection = new CrossBlockSelection()
    const root = { classList: { add() {}, remove() {} } }
    selection.activate(range, root)
    assert.equal(selection.range, range)
    selection.deactivate(root)
    assert.equal(selection.range, null)
  } finally {
    globalThis.CSS = previousCSS
    globalThis.Highlight = previousHighlight
  }
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [['set', 'oe-cross-select'], ['delete', 'oe-cross-select']])
})


test('split conversion boundary helpers create ranges in the content document', () => {
  const calls = []
  const full = { selectNodeContents(node) { calls.push(['select', node]) } }
  const ownerDocument = { createRange() { calls.push(['create']); return full } }
  const content = { ownerDocument }
  const range = {
    compareBoundaryPoints(how, candidate) {
      calls.push(['compare', how, candidate])
      return how === 0 ? 0 : 1
    },
  }
  const previousDocument = globalThis.document
  const previousRange = globalThis.Range
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.Range = new Proxy({}, { get() { throw new Error('ambient Range constants must not be used') } })
  try {
    assert.equal(rangeStartsAtBeginning(content, range), true)
    assert.equal(rangeEndsAtEnd(content, range), true)
  } finally {
    globalThis.document = previousDocument
    globalThis.Range = previousRange
  }
  assert.deepEqual(calls.filter(call => call[0] === 'compare').map(call => call[1]), [0, 2])
})
