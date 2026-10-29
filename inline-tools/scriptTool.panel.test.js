import test from 'node:test'
import assert from 'node:assert/strict'
import { createScriptTool } from './scriptTool.js'

// Selection-capability protocol only. HTML transformations, direction and
// canonical history are exercised by script-panel.html in a real browser.
class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.nodeType = 1
    this.ownerDocument = ownerDocument
    this.children = []
    this.childNodes = this.children
    this.attributes = new Map()
    this.listeners = new Map()
    this.classList = { add() {} }
  }
  appendChild(child) { this.children.push(child); return child }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? (name === 'contenteditable' ? 'true' : null) }
  addEventListener(name, callback) { this.listeners.set(name, callback) }
  click() { this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} }) }
  closest(selector) { return selector === '[contenteditable="true"]' || selector === '[contenteditable]' ? this : null }
  normalize() {}
  matches() { return false }
  querySelector() { return null }
  querySelectorAll() { return [] }
}

function fixture() {
  const ownerDocument = { createElement: tag => new Element(tag, ownerDocument),
    createTreeWalker: () => ({ nextNode: () => null }),
  }
  const field = ownerDocument.createElement('p')
  const wrapped = []
  const range = { startContainer: field, endContainer: field, commonAncestorContainer: field,
    collapsed: false, intersectsNode: () => false,
    surroundContents(wrapper) { wrapped.push(wrapper.tagName) },
  }
  const events = []
  const flags = { current: true, restore: true, fail: false }
  const ctx = {
    get range() { return flags.current ? range : null },
    mutate(operation) {
      events.push('attempt')
      if (!flags.current) return undefined
      events.push('admitted')
      if (flags.fail) throw new Error('projection failed')
      const result = operation(range)
      events.push('committed')
      return result
    },
    restoreSelection() { events.push('restore'); return flags.current && flags.restore },
    close() { events.push('close') },
    showTooltip() {}, hideTooltip() {},
  }
  const tool = createScriptTool({ sup: 'Superscript', sub: 'Subscript', none: 'Normal' })
  return { tool, ctx, flags, events, wrapped, panel: () => tool.renderActions(ctx) }
}

test('Script mode selection uses panel authority without a mounted button selection port', () => {
  const h = fixture()
  const panel = h.panel()
  panel.children[1].click() // Superscript, after Back.
  assert.deepEqual(h.wrapped, ['SUP'])
  assert.deepEqual(h.events, ['attempt', 'admitted', 'restore', 'restore', 'committed', 'close'])
})

test('Script panel never reacquires or restores through a retired mounted selection port', () => {
  const h = fixture()
  h.tool.bindSelectionPort({
    get range() { throw new Error('mounted port cannot own this panel') },
    capture() { throw new Error('mounted capture must not run') },
    restore() { throw new Error('mounted restore must not run') },
  })
  const panel = h.panel()
  panel.children[2].click() // Subscript.
  assert.deepEqual(h.wrapped, ['SUB'])
  assert.equal(h.events.filter(event => event === 'committed').length, 1)
})

test('a retired Script panel cannot execute a mutation or close a successor', () => {
  const h = fixture(), panel = h.panel()
  h.flags.current = false
  panel.children[2].click()
  assert.deepEqual(h.wrapped, [])
  assert.deepEqual(h.events, ['attempt'])
})

test('Script does not close its panel after rejected restoration or transaction failure', () => {
  for (const reason of ['restore', 'fail']) {
    const h = fixture(), panel = h.panel()
    h.flags[reason] = reason === 'fail'
    assert.throws(() => panel.children[2].click(), /selection|projection/i)
    assert.equal(h.events.includes('close'), false)
    assert.equal(h.events.includes('committed'), false)
  }
})

test('Normal uses the admitted panel selection without applying another script wrapper', () => {
  const h = fixture(), panel = h.panel()
  panel.children[3].click()
  assert.deepEqual(h.wrapped, [])
  assert.deepEqual(h.events, ['attempt', 'admitted', 'restore', 'committed', 'close'])
})
