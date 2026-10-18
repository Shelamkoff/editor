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
