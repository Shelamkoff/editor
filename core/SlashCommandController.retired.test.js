import test from 'node:test'
import assert from 'node:assert/strict'
import { SlashCommandController } from './SlashCommandController.js'

function fixture() {
  const handlers = new Map()
  let ownershipReads = 0
  let nativeInputReads = 0
  const menu = {
    style: {},
    setAttribute() {},
    replaceChildren() {},
    remove() {},
  }
  const document = {
    defaultView: {
      AbortController,
      addEventListener() {},
      getSelection() {
        nativeInputReads++
        throw new Error('destroyed slash owner read native selection')
      },
    },
    createElement(tag) {
      assert.equal(tag, 'ul', 'a stale callback allocated a new menu element')
      return menu
    },
    addEventListener() {},
  }
  const root = {
    ownerDocument: document,
    appendChild(element) { assert.strictEqual(element, menu) },
    addEventListener(type, callback) { handlers.set(type, callback) },
  }
  const controller = new SlashCommandController({
    root,
    runtime: { readOnly: false },
    registry: { blockTypes: [], inlineTypes: [] },
    reconciler: {
      resolveEditableTarget() {
        ownershipReads++
        throw new Error('destroyed slash owner accessed a retired editing field')
      },
    },
    selection: { capture() { throw new Error('retired slash owner captured selection') } },
    view: {},
    inlineCommands: {},
  })
  return { controller, handlers, get ownershipReads() { return ownershipReads },
    get nativeInputReads() { return nativeInputReads } }
}

test('captured Slash input event cannot access a retired editing host after destroy', () => {
  const h = fixture()
  const retainedInput = h.handlers.get('input')
  assert.equal(typeof retainedInput, 'function')
  h.controller.destroy()
  assert.doesNotThrow(() => retainedInput({ target: {}, isComposing: false }))
  assert.equal(h.ownershipReads, 0)
  assert.equal(h.nativeInputReads, 0)
  assert.equal(h.controller.isOpen, false)
})

test('Slash retained keyboard and scroll callbacks do not recreate menu after teardown', () => {
  const h = fixture()
  const keyboard = h.handlers.get('keydown')
  h.controller.destroy()
  let prevented = false
  assert.doesNotThrow(() => keyboard({
    key: 'Enter', target: {}, defaultPrevented: false,
    preventDefault() { prevented = true },
  }))
  assert.equal(prevented, false)
  assert.equal(h.controller.isOpen, false)
  h.controller.destroy()
})
test('failed Slash command metadata preparation leaves no orphan menu', () => {
  let attached = false, removed = 0
  const menu = {
    style: {},
    setAttribute() {},
    replaceChildren() {},
    remove() { attached = false; removed++ },
  }
  const document = {
    defaultView: { AbortController },
    createElement() { return menu },
    addEventListener() {},
  }
  const root = {
    ownerDocument: document,
    appendChild(node) { assert.equal(node, menu); attached = true },
    addEventListener() {},
  }
  assert.throws(() => new SlashCommandController({
    root, runtime: { readOnly: false },
    registry: {
      blockTypes: ['paragraph'], inlineTypes: [],
      getBlockDefinition() {
        return { type: 'paragraph', label: { key: 'name', fallback: 'Paragraph' } }
      },
    },
    reconciler: {}, selection: {}, view: {}, inlineCommands: {},
    translate() { throw new Error('locale provider failed') },
  }), /locale provider failed/)
  assert.equal(attached, false,
    'failed item preparation left a menu without any destroyable controller')
  assert.equal(removed, 1, 'failed Slash menu was not disposed exactly once')
})

test('failed Slash listener registration releases menu and partially added listeners', () => {
  let attached = false, removed = 0
  const listeners = new Map()
  const menu = {
    style: {}, setAttribute() {}, replaceChildren() {},
    remove() { attached = false; removed++ },
  }
  const attach = (type, callback, options = {}) => {
    const callbacks = listeners.get(type) ?? []
    callbacks.push(callback)
    listeners.set(type, callbacks)
    options.signal?.addEventListener?.('abort', () => {
      listeners.set(type, (listeners.get(type) ?? []).filter(fn => fn !== callback))
    })
    if (type === 'keydown') throw new Error('slash listener host failed')
  }
  const document = {
    defaultView: { AbortController, addEventListener: attach },
    createElement() { return menu },
    addEventListener: attach,
  }
  const root = {
    ownerDocument: document,
    appendChild() { attached = true },
    addEventListener: attach,
  }
  assert.throws(() => new SlashCommandController({
    root, runtime: { readOnly: false },
    registry: { blockTypes: [], inlineTypes: [] },
    reconciler: {}, selection: {}, view: {}, inlineCommands: {},
  }), /slash listener host failed/)
  assert.equal(attached, false, 'failed constructor retained an orphan menu')
  assert.equal(removed, 1)
  assert.deepEqual([...listeners.values()].flat(), [],
    'failed constructor retained native handlers without a controller to destroy')
})

test('Slash input owner resolver cannot continue after destroying its editor', () => {
  const callbacks = new Map()
  let reads = 0, controller
  const menu = { style: {}, setAttribute() {}, replaceChildren() {}, remove() {} }
  const document = {
    defaultView: { AbortController },
    createElement() { return menu },
    addEventListener() {},
  }
  const root = {
    ownerDocument: document,
    appendChild() {},
    addEventListener(type, callback) { callbacks.set(type, callback) },
  }
  controller = new SlashCommandController({
    root, runtime: { readOnly: false },
    registry: { blockTypes: [], inlineTypes: [] },
    reconciler: {
      resolveEditableTarget() {
        controller.destroy()
        return { mode: 'rich-text', blockId: 'a', fieldKey: 'text', element: {} }
      },
    },
    selection: {
      capture() { reads++; throw new Error('destroyed Slash controller read selection') },
    },
    view: {}, inlineCommands: {},
  })
  assert.doesNotThrow(() => callbacks.get('input')({
    target: {}, isComposing: false,
  }), 'an obsolete Slash input handler continued through native selection')
  assert.equal(reads, 0)
  assert.equal(controller.isOpen, false)
})
test('Slash input in read-only mode dismisses an already open command menu', () => {
  const handlers = new Map()
  const text = { nodeType: 3, textContent: '/' }
  const field = {
    nodeType: 1, tagName: 'P', isConnected: true, childNodes: [text],
    hasAttribute() { return false },
    contains(node) { return node === text },
  }
  text.parentElement = field
  text.parentNode = field
  const menu = {
    style: {}, children: [], offsetWidth: 100, offsetHeight: 100,
    setAttribute() {}, replaceChildren() { this.children = [] },
    appendChild(node) { this.children.push(node) }, remove() {},
  }
  const document = {
    defaultView: {
      AbortController, innerWidth: 1000, innerHeight: 1000,
      getSelection() {
        return { focusNode: text, focusOffset: 1, rangeCount: 1 }
      },
      addEventListener() {},
    },
    createElement(type) {
      if (type === 'ul') return menu
      return { className: '', setAttribute() {}, textContent: '' }
    },
    createRange() {
      return {
        selectNodeContents() {}, setEnd() {}, setStart() {},
        toString() { return '/' },
        getClientRects() { return [{ left: 20, top: 10, bottom: 30 }] },
        getBoundingClientRect() { return { left: 20, top: 10, bottom: 30 } },
      }
    },
    addEventListener() {},
  }
  field.ownerDocument = document
  const root = {
    ownerDocument: document,
    getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 1000 } },
    contains(node) { return node === field },
    appendChild() {},
    addEventListener(type, callback) { handlers.set(type, callback) },
  }
  const runtime = { readOnly: false, modeEpoch: 0 }
  const controller = new SlashCommandController({
    root, runtime, registry: { blockTypes: [], inlineTypes: [] },
    reconciler: {
      resolveEditableTarget() {
        return { mode: 'rich-text', blockId: 'a', fieldKey: 'text', element: field }
      },
    },
    selection: {
      capture() {
        const point = { blockId: 'a', fieldKey: 'text', offset: 1 }
        return { anchor: point, focus: { ...point } }
      },
    },
    view: {}, inlineCommands: {},
  })
  const input = () => handlers.get('input')({ target: field, isComposing: false })
  try {
    input()
    assert.equal(controller.isOpen, true, 'fixture did not open a native Slash query')
    runtime.readOnly = true
    input()
    assert.equal(controller.isOpen, false,
      'read-only input left the old command menu open')
  } finally {
    controller.destroy()
  }
})
