// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createFontSizeTool } from './fontSize.js'
import { createSelectionPortBinding } from './utils.js'
import { InlineToolMounts } from '../core/InlineToolMounts.js'

// Ownership protocol tests. The adapter records focus/select calls, without
// inventing number-input selection behavior. Browser tests cover native effects.
function fixture(scheduler, source = createFontSizeTool('Font size')) {
  const frames = new Map(), events = [], errors = []
  let frameId = 0, cancelled = 0, invoked = 0, active = true, lease = 0
  let focusHook = null, validationHook = null
  class Element {
    constructor(tag, document) {
      this.nodeType = 1; this.tagName = tag.toUpperCase(); this.localName = tag
      this.ownerDocument = document; this.parentNode = null; this.parentElement = null
      this.children = []; this.childNodes = this.children; this.dataset = {}
      this.attrs = new Map(); this.listeners = new Map(); this.className = ''; this.textContent = ''
      this.classList = { add() {}, toggle() {} }; this.style = { display: '', fontSize: '' }
      this.value = ''; this.focusCalls = 0; this.selectCalls = 0
    }
    get isConnected() { return this === this.ownerDocument.body || this.parentNode?.isConnected === true }
    get offsetParent() { return this.isConnected && this.style.display !== 'none' ? this.parentNode : null }
    get firstChild() { return this.children[0] ?? null }
    get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })) }
    appendChild(child) {
      child.remove(); child.parentNode = this; child.parentElement = this; this.children.push(child)
      return child
    }
    remove() {
      if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1)
      this.parentNode = null; this.parentElement = null
    }
    contains(node) { return this === node || this.children.some(child => child.contains(node)) }
    setAttribute(name, value) {
      this.attrs.set(name, String(value))
      if (name.startsWith('data-')) this.dataset[name.slice(5)] = String(value)
    }
    getAttribute(name) { return this.attrs.get(name) ?? null }
    hasAttribute(name) { return this.attrs.has(name) }
    addEventListener(name, listener) { this.listeners.set(name, listener) }
    removeEventListener(name, listener) { if (this.listeners.get(name) === listener) this.listeners.delete(name) }
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')])
      if (selector === '[data-size]') return all.filter(child => child.hasAttribute('data-size'))
      if (selector === 'span') return all.filter(child => child.localName === 'span')
      return selector === '*' ? all : []
    }
    closest(selector) {
      if (selector === '.oe-inline-toolbar') return this.className === 'oe-inline-toolbar' ? this : this.parentElement?.closest(selector) ?? null
      if (selector === '[contenteditable="true"]' || selector === '[contenteditable]') {
        return this.getAttribute('contenteditable') === 'true' ? this : this.parentElement?.closest(selector) ?? null
      }
      return null
    }
    matches(selector) { return selector === '[contenteditable="true"]' && this.getAttribute('contenteditable') === 'true' }
    focus() { this.focusCalls++; this.ownerDocument.activeElement = this; if (this === input) focusHook?.() }
    select() { this.selectCalls++ }
  }
  const document = {
    activeElement: null, defaultView: { getSelection: () => null },
    createElement: tag => new Element(tag, document),
    createTreeWalker: () => ({ nextNode: () => null }),
    addEventListener() {}, removeEventListener() {},
  }
  document.body = document.createElement('body')
  if (scheduler === 'frame') {
    document.defaultView.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId }
    document.defaultView.cancelAnimationFrame = id => { if (frames.delete(id)) cancelled++ }
  }
  const toolbar = document.createElement('div'); toolbar.className = 'oe-inline-toolbar'; document.body.appendChild(toolbar)
  const button = document.createElement('button'); toolbar.appendChild(button)
  const field = document.createElement('div'); field.setAttribute('contenteditable', 'true'); document.body.appendChild(field)
  const range = { startContainer: field, startOffset: 0, endContainer: field, endOffset: 0,
    commonAncestorContainer: field, collapsed: false, intersectsNode: () => false }
  const valid = bookmark => active && bookmark?.owner === document && bookmark.lease === lease
  const port = {
    get range() { return active ? range : null },
    capture(requested) { return active && requested === range ? Object.freeze({ owner: document, lease }) : null },
    isValid(bookmark) { validationHook?.(); return valid(bookmark) },
    restore(bookmark) { events.push('restore'); return valid(bookmark) },
  }
  const mounts = new InlineToolMounts([source], { prepareExtensionValue: operation => operation() }, error => errors.push(String(error)))
  const mounted = mounts.tools[0]
  mounts.start(mounted, port, button, {
    mutate(bookmark, operation) { events.push('attempt'); if (valid(bookmark)) { events.push('admitted'); return operation(range) } },
    restoreSelection(bookmark) { events.push('restoreSelection'); return valid(bookmark) },
  }, () => { active = false })
  const dropdown = toolbar.children.find(element => element.className === 'oe-font-size-dropdown')
  const descendants = dropdown.querySelectorAll('*')
  const input = descendants.find(element => element.localName === 'input')
  const apply = descendants.find(element => element.className === 'oe-font-size-apply')
  const reset = descendants.find(element => element.className === 'oe-font-size-reset')
  const preset = descendants.find(element => element.dataset.size === '24')
  const successor = document.createElement('input'); document.body.appendChild(successor)
  const host = document.createElement('section'); document.body.appendChild(host)
  document.activeElement = successor
  return {
    source, document, dropdown, input, apply, reset, preset, successor, host, events, errors,
    open() { mounted.toggle(null); assert.equal(source.isDropdownOpen(), true) },
    close() { mounted.toggle(null) }, destroy() { mounts.destroy() },
    retire() { active = false }, changeSelection() { lease++ },
    onFocus(callback) { focusHook = callback }, onValidation(callback) { validationHook = callback },
    async flush() {
      if (scheduler === 'frame') {
        // Removed callbacks are never invoked: cancellation belongs to the scheduler.
        for (const [id, callback] of [...frames]) if (frames.delete(id)) { invoked++; callback() }
      } else await Promise.resolve()
    },
    get scheduled() { return { cancelled, invoked, pending: frames.size } },
  }
}

function emit(element, type, key) {
  const event = { target: element, key, prevented: 0, stopped: 0,
    preventDefault() { this.prevented++ }, stopPropagation() { this.stopped++ } }
  element.listeners.get(type)?.(event)
  return event
}

function adopt(element, document) {
  element.ownerDocument = document
  for (const child of element.children) adopt(child, document)
}

for (const scheduler of ['frame', 'microtask']) {
  test(`FontSize ${scheduler} focuses and selects a live mounted input`, async t => {
    const h = fixture(scheduler); t.after(() => h.destroy()); h.open(); await h.flush()
    assert.equal(h.input.focusCalls, 1); assert.equal(h.input.selectCalls, 1)
    assert.ok(h.document.activeElement === h.input)
    assert.deepEqual(h.errors, [])
  })

  for (const action of ['close', 'destroy', 'retire', 'changeSelection', 'selection-roundtrip']) {
    test(`FontSize ${scheduler} rejects deferred focus after ${action}`, async t => {
      const h = fixture(scheduler); t.after(() => h.destroy()); h.open()
      if (action === 'selection-roundtrip') { h.changeSelection(); h.changeSelection() }
      else h[action]()
      if (action === 'destroy') h.host.appendChild(h.input)
      await h.flush()
      assert.equal(h.input.focusCalls, 0); assert.equal(h.input.selectCalls, 0)
      assert.ok(h.document.activeElement === h.successor)
      if (scheduler === 'frame' && (action === 'close' || action === 'destroy')) {
        assert.deepEqual(h.scheduled, { cancelled: 1, invoked: 0, pending: 0 })
      }
    })
  }

  test(`FontSize ${scheduler} rechecks local state after validation closes the dropdown`, async t => {
    const h = fixture(scheduler); t.after(() => h.destroy()); h.open()
    h.onValidation(() => { h.onValidation(null); h.close() })
    await h.flush()
    assert.equal(h.input.focusCalls, 0); assert.equal(h.input.selectCalls, 0)
  })

  test(`FontSize ${scheduler} cannot focus an extracted input`, async t => {
    const h = fixture(scheduler); t.after(() => h.destroy()); h.open(); h.host.appendChild(h.input)
    await h.flush(); assert.equal(h.input.focusCalls, 0); assert.equal(h.input.selectCalls, 0)
  })

  test(`FontSize ${scheduler} preserves a harmless nested input layout`, async t => {
    const h = fixture(scheduler); t.after(() => h.destroy()); h.open()
    const wrapper = h.document.createElement('div'); h.dropdown.appendChild(wrapper); wrapper.appendChild(h.input)
    await h.flush(); assert.equal(h.input.focusCalls, 1); assert.equal(h.input.selectCalls, 1)
  })

  test(`FontSize ${scheduler} rejects foreign-document dropdown adoption`, async t => {
    const h = fixture(scheduler); t.after(() => h.destroy()); h.open()
    const foreign = { body: null, defaultView: {} }; foreign.body = h.document.createElement('body'); foreign.body.ownerDocument = foreign
    adopt(h.dropdown, foreign); foreign.body.appendChild(h.dropdown)
    await h.flush(); assert.equal(h.input.focusCalls, 0); assert.equal(h.input.selectCalls, 0)
  })

  for (const action of ['close', 'destroy', 'changeSelection']) {
    test(`FontSize ${scheduler} rechecks ownership after focus triggers ${action}`, async t => {
      const h = fixture(scheduler); t.after(() => h.destroy()); h.open()
      h.onFocus(() => { h[action](); h.host.appendChild(h.input); h.successor.focus() })
      await h.flush()
      assert.equal(h.input.focusCalls, 1); assert.equal(h.input.selectCalls, 0)
      assert.ok(h.document.activeElement === h.successor)
    })
  }

  test(`FontSize ${scheduler} close and reopen uses only the new deferred focus`, async t => {
    const h = fixture(scheduler); t.after(() => h.destroy()); h.open(); h.close(); h.open()
    await h.flush(); assert.equal(h.input.focusCalls, 1); assert.equal(h.input.selectCalls, 1)
  })

  test(`FontSize ${scheduler} focus-triggered reopen uses its own callback`, async t => {
    const h = fixture(scheduler); t.after(() => h.destroy()); h.open()
    h.onFocus(() => { h.onFocus(null); h.close(); h.open() })
    await h.flush(); await h.flush()
    assert.equal(h.input.focusCalls, 2); assert.equal(h.input.selectCalls, 1)
  })

  test(`FontSize ${scheduler} retained Enter and Apply are inert after cleanup`, async () => {
    const h = fixture(scheduler); h.open(); h.destroy(); h.events.length = 0
    for (const event of [emit(h.input, 'keydown', 'Enter'), emit(h.apply, 'click')]) {
      assert.equal(event.prevented, 0); assert.equal(event.stopped, 0)
    }
    await h.flush(); assert.deepEqual(h.events, []); assert.equal(h.source.isDropdownOpen(), false)
  })

  test(`FontSize ${scheduler} same-tool remount cannot inherit a pending callback`, async t => {
    const old = fixture(scheduler); old.open(); old.destroy()
    const current = fixture(scheduler, old.source); t.after(() => current.destroy()); current.open()
    await old.flush(); await current.flush()
    assert.equal(old.input.focusCalls, 0); assert.equal(old.input.selectCalls, 0)
    assert.equal(current.input.focusCalls, 1); assert.equal(current.input.selectCalls, 1)
    assert.deepEqual(old.errors, []); assert.deepEqual(current.errors, [])
  })
}

const controls = {
  Enter: h => emit(h.input, 'keydown', 'Enter'), Escape: h => emit(h.dropdown, 'keydown', 'Escape'),
  Apply: h => emit(h.apply, 'click'), Reset: h => emit(h.reset, 'click'), preset: h => emit(h.preset, 'click'),
  Backspace: h => emit(h.input, 'keydown', 'Backspace'), input: h => emit(h.input, 'input'),
  mousedown: h => emit(h.dropdown, 'mousedown'),
}

for (const [name, dispatch] of Object.entries(controls)) {
  test(`retained FontSize ${name} cannot act for a subsequent mount`, t => {
    const old = fixture('frame'); old.open(); old.close(); old.destroy()
    const current = fixture('frame', old.source); t.after(() => current.destroy()); current.open()
    // Keeping the old UI inside the new dropdown prevents an outside click from
    // legitimately closing the new control. These calls isolate old listeners.
    adopt(old.dropdown, current.document); current.dropdown.appendChild(old.dropdown)
    old.input.value = '72'; current.input.value = '28'; current.events.length = 0
    const event = dispatch(old)
    assert.deepEqual(current.events, [])
    assert.equal(current.source.isDropdownOpen(), true)
    assert.equal(current.input.value, '28')
    assert.equal(event.prevented, 0); assert.equal(event.stopped, 0)
  })
}

test('current FontSize controls still work after same-tool reuse', t => {
  const old = fixture('frame'); old.destroy()
  const h = fixture('frame', old.source); t.after(() => h.destroy())
  for (const name of ['Enter', 'Apply', 'preset', 'Reset', 'Escape']) {
    h.open(); h.input.value = '28'; h.events.length = 0
    const event = controls[name](h)
    assert.ok(event.prevented > 0); assert.ok(event.stopped > 0)
    assert.equal(h.source.isDropdownOpen(), false)
    if (['Enter', 'Apply', 'preset'].includes(name)) assert.ok(h.events.includes('admitted'))
    assert.ok(h.events.includes('restoreSelection'))
  }
  h.open()
  for (const name of ['Backspace', 'input', 'mousedown']) {
    const event = controls[name](h)
    assert.ok(event.stopped > 0); assert.equal(h.source.isDropdownOpen(), true)
  }
  const event = { target: h.input, preventDefault() { throw Error('number input retains native mousedown') }, stopPropagation() {} }
  h.dropdown.listeners.get('mousedown')(event)
})

for (const action of ['close', 'destroy']) {
  test(`FontSize ${action} cancels RAF in the original scheduling realm after adoption`, async t => {
    const h = fixture('frame'); t.after(() => h.destroy()); h.open()
    const wrongCancellations = []
    const foreign = { defaultView: { cancelAnimationFrame: id => wrongCancellations.push(id) } }
    foreign.body = h.document.createElement('body'); foreign.body.ownerDocument = foreign
    adopt(h.dropdown, foreign); foreign.body.appendChild(h.dropdown)
    h[action](); await h.flush()
    assert.deepEqual(wrongCancellations, [])
    assert.deepEqual(h.scheduled, { cancelled: 1, invoked: 0, pending: 0 })
    assert.equal(h.input.focusCalls, 0)
  })
}

test('selection binding validates with its current owner without restoring focus', () => {
  const binding = createSelectionPortBinding(), bookmark = Object.freeze({}), calls = []
  const owner = { isValid(value) { assert.ok(this === owner); calls.push(value); return value === bookmark },
    restore() { throw Error('validation must not restore') } }
  binding.bind(owner)
  assert.equal(binding.port.isValid(bookmark), true)
  assert.equal(binding.port.isValid({}), false)
  assert.equal(calls.length, 2)
  binding.bind(null); assert.equal(binding.port.isValid(bookmark), false)
})

test('selection binding fails closed for missing validation and a reentrant owner change', () => {
  const binding = createSelectionPortBinding(), bookmark = Object.freeze({})
  assert.equal(binding.port.isValid(bookmark), false)
  binding.bind({}); assert.equal(binding.port.isValid(bookmark), false)
  binding.bind({ isValid() { binding.bind({ isValid: () => true }); return true } })
  assert.equal(binding.port.isValid(bookmark), false)
})
