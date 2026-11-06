import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { retainControlFocus } from './retainControlFocus.js'

class Element {
  constructor(document, tag, parent = null) {
    this.ownerDocument = document
    this.tag = tag
    this.parentElement = parent
    this.hidden = false
    this.contentEditable = 'inherit'
    this.focusCalls = []
  }
  get isConnected() {
    return this === this.ownerDocument.body || Boolean(this.parentElement?.isConnected)
  }
  contains(element) {
    for (let current = element; current; current = current.parentElement) if (current === this) return true
    return false
  }
  closest(selector) {
    const choices = selector.split(',')
    for (let current = this; current; current = current.parentElement) {
      if (choices.some(choice => choice === current.tag
        || choice === '[hidden]' && current.hidden
        || choice === '[contenteditable="true"]' && current.contentEditable === 'true')) return current
    }
    return null
  }
  focus(options) {
    this.focusCalls.push(options)
    if (this.ownerDocument.activeElement === this || !this.isConnected) return
    this.ownerDocument.activeElement = this
    this.ownerDocument.dispatchEvent(new Event('focusin'))
  }
  remove() {
    const owned = this.contains(this.ownerDocument.activeElement)
    this.parentElement = null
    // Projection removal loses focus without a new owner acquiring focusin.
    if (owned) this.ownerDocument.activeElement = this.ownerDocument.body
  }
}

function fixture() {
  const document = new EventTarget()
  document.body = new Element(document, 'body')
  document.activeElement = document.body
  const wrapper = new Element(document, 'div', document.body)
  const button = new Element(document, 'button', wrapper)
  const outside = new Element(document, 'input', document.body)
  const field = new Element(document, 'div', document.body)
  field.contentEditable = 'true'
  button.focus()
  return { document, wrapper, button, outside, field }
}

for (const destination of ['outside', 'field']) {
  test(`a plugin action preserves newer ${destination} focus acquired during its operation`, () => {
    const h = fixture()
    const result = { committed: true }
    let calls = 0
    assert.equal(retainControlFocus(h.wrapper, () => {
      calls++
      h.button.remove()
      h[destination].focus()
      return result
    }), result)
    assert.equal(calls, 1)
    assert.equal(h.document.activeElement, h[destination], 'the old plugin control reclaimed focus')
    assert.deepEqual(h.wrapper.focusCalls, [])
    assert.equal(getEventListeners(h.document, 'focusin').length, 0)
  })
}

test('a plugin action cannot reclaim ownership after a newer focused control is removed', () => {
  const h = fixture()
  retainControlFocus(h.wrapper, () => {
    h.button.remove()
    h.outside.focus()
    h.outside.remove()
  })
  assert.equal(h.document.activeElement, h.document.body)
  assert.deepEqual(h.wrapper.focusCalls, [], 'losing the newer control cannot restore the old ownership')
  assert.equal(getEventListeners(h.document, 'focusin').length, 0)
})

test('ordinary focused-button projection loss returns keyboard ownership to the wrapper', () => {
  const h = fixture()
  const result = { accepted: true }
  assert.equal(retainControlFocus(h.wrapper, () => {
    h.button.remove()
    return result
  }), result)
  assert.equal(h.document.activeElement, h.wrapper)
  assert.deepEqual(h.wrapper.focusCalls, [{ preventScroll: true }])
  assert.equal(getEventListeners(h.document, 'focusin').length, 0)
})

test('hiding the original control still returns keyboard ownership to the wrapper', () => {
  const h = fixture()
  retainControlFocus(h.wrapper, () => { h.button.hidden = true })
  assert.equal(h.document.activeElement, h.wrapper)
  assert.deepEqual(h.wrapper.focusCalls, [{ preventScroll: true }])
  assert.equal(getEventListeners(h.document, 'focusin').length, 0)
})

test('a retained visible button keeps its focus without a redundant wrapper focus', () => {
  const h = fixture()
  retainControlFocus(h.wrapper, () => {})
  assert.equal(h.document.activeElement, h.button)
  assert.deepEqual(h.wrapper.focusCalls, [])
  assert.equal(getEventListeners(h.document, 'focusin').length, 0)
})

for (const kind of ['input', 'textarea', 'select', 'contenteditable']) {
  test(`an initial ${kind} field does not grant the wrapper control-focus ownership`, () => {
    const h = fixture()
    const field = new Element(h.document, kind === 'contenteditable' ? 'div' : kind, h.wrapper)
    if (kind === 'contenteditable') field.contentEditable = 'true'
    field.focus()
    const result = retainControlFocus(h.wrapper, () => { field.remove(); return 17 })
    assert.equal(result, 17)
    assert.equal(h.document.activeElement, h.document.body)
    assert.deepEqual(h.wrapper.focusCalls, [])
    assert.equal(getEventListeners(h.document, 'focusin').length, 0)
  })
}

for (const kind of ['input', 'textarea', 'select']) {
  for (const transfer of [false, true]) {
    test(`an opted-in ${kind} replacement preserves ${transfer ? 'new observer' : 'ordinary wrapper'} focus`, () => {
      const h = fixture()
      const control = new Element(h.document, kind, h.wrapper)
      control.focus()
      const result = { accepted: true }
      assert.equal(retainControlFocus(h.wrapper, () => {
        control.remove()
        if (transfer) h.outside.focus()
        return result
      }, { includeFormControls: true }), result)
      assert.equal(h.document.activeElement, transfer ? h.outside : h.wrapper)
      assert.deepEqual(h.wrapper.focusCalls, transfer ? [] : [{ preventScroll: true }])
      assert.equal(getEventListeners(h.document, 'focusin').length, 0)
    })
  }
}

test('form-control opt-in still excludes a rich-text field', () => {
  const h = fixture()
  const field = new Element(h.document, 'div', h.wrapper)
  field.contentEditable = 'true'
  field.focus()
  retainControlFocus(h.wrapper, () => { field.remove() }, { includeFormControls: true })
  assert.equal(h.document.activeElement, h.document.body)
  assert.deepEqual(h.wrapper.focusCalls, [])
  assert.equal(getEventListeners(h.document, 'focusin').length, 0)
})

test('an action without initial wrapper ownership leaves external focus intact', () => {
  const h = fixture()
  h.outside.focus()
  retainControlFocus(h.wrapper, () => { h.button.remove() })
  assert.equal(h.document.activeElement, h.outside)
  assert.deepEqual(h.wrapper.focusCalls, [])
  assert.equal(getEventListeners(h.document, 'focusin').length, 0)
})

test('removing the wrapper never restores focus to its retired controls', () => {
  const h = fixture()
  retainControlFocus(h.wrapper, () => { h.wrapper.remove() })
  assert.equal(h.document.activeElement, h.document.body)
  assert.deepEqual(h.wrapper.focusCalls, [])
  assert.equal(getEventListeners(h.document, 'focusin').length, 0)
})

test('an operation failure keeps its original error and releases focus observation', () => {
  const h = fixture()
  const error = new Error('the update failed')
  assert.throws(() => retainControlFocus(h.wrapper, () => {
    h.button.remove()
    throw error
  }), actual => actual === error)
  assert.equal(h.document.activeElement, h.document.body)
  assert.deepEqual(h.wrapper.focusCalls, [], 'a rejected update must not add a focus side effect')
  assert.equal(getEventListeners(h.document, 'focusin').length, 0)
})
