import test from 'node:test'
import assert from 'node:assert/strict'

import { InlineSelectionAuthority } from './InlineSelectionAuthority.js'

function fixture() {
  const ownerDocument = {
    createRange() {
      return {
        startContainer: null, endContainer: null,
        startOffset: 0, endOffset: 0, collapsed: true,
        setStart(node, offset) { this.startContainer = node; this.startOffset = offset; this.collapsed = false },
        setEnd(node, offset) { this.endContainer = node; this.endOffset = offset; this.collapsed = this.startContainer === node && this.startOffset === offset },
        cloneRange() { return { ...this } },
      }
    },
  }
  const field = {
    nodeType: 1,
    tagName: 'P',
    ownerDocument,
    isConnected: true,
    childNodes: [],
    closest() { return null },
    hasAttribute() { return false },
    contains(node) { return node === this || this.childNodes.includes(node) },
  }
  const text = {
    nodeType: 3,
    textContent: 'Alpha',
    parentElement: field,
    parentNode: field,
    previousSibling: null,
  }
  field.childNodes.push(text)
  const root = {
    ownerDocument,
    isConnected: true,
    contains(node) { return node === field || node === text },
  }
  const runtime = {
    health: 'ready',
    readOnly: false,
    generation: 1,
    revision: 2,
    indexOf: id => id === 'block' ? 0 : -1,
    prepareExtensionValue: run => run(),
  }
  const reconciler = {
    getEditableField: (id, key) => id === 'block' && key === 'text'
      ? { key: 'text', mode: 'rich-text', element: field } : null,
    getEditableFields: id => id === 'block'
      ? [{ key: 'text', mode: 'rich-text', element: field }] : [],
  }
  let lease = 7
  let access = true
  let mutating = false
  let applied = []
  let bookmark = {
    anchor: { blockId: 'block', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'block', fieldKey: 'text', offset: 4 },
  }
  let range = {
    startContainer: text, startOffset: 1,
    endContainer: text, endOffset: 4,
    collapsed: false,
    cloneRange() { return { ...this } },
  }
  const port = new InlineSelectionAuthority({
    root,
    runtime,
    reconciler,
    readSelection: () => ({ range, bookmark }),
    restoreSelection(value) { applied.push(value); return true },
    lease: () => lease,
    canAccess: () => access,
    isMutating: () => mutating,
  })
  return {
    port, root, runtime, field, text,
    setLease(value) { lease = value },
    setAccess(value) { access = value },
    setMutation(value) { mutating = value },
    setBookmark(value) { bookmark = value },
    setRange(value) { range = value },
    get applied() { return applied },
  }
}

test('staged and retired scoped ports expose no range or selection authority', () => {
  const state = fixture()
  assert.equal(state.port.range, null)
  assert.equal(state.port.capture(), null)
  assert.equal(state.port.restore({}), false)
  assert.equal(state.port.activate(), true)
  assert.notEqual(state.port.range, null)
  const token = state.port.capture()
  assert.ok(token)
  assert.equal(state.port.isValid(token), true)
  state.port.revoke()
  assert.equal(state.port.isValid(token), false)
  assert.equal(state.port.range, null)
  assert.equal(state.port.capture(), null)
  assert.equal(state.port.restore(token), false)
  assert.equal(state.port.activate(), false)
  assert.deepEqual(state.applied, [])
})

test('foreign and forged tokens cannot restore or inspect their option getters', () => {
  const state = fixture()
  state.port.activate()
  const token = state.port.capture()
  const foreign = fixture()
  foreign.port.activate()
  const access = { get endOffsetDelta() { throw new Error('accessor invoked') } }
  assert.equal(state.port.restore({ ...token }, access), false)
  assert.equal(foreign.port.restore(token, access), false)
  assert.deepEqual(state.applied, [])
})

test('revision, generation, native lease, read-only and phase expire old restoration rights', () => {
  const state = fixture()
  state.port.activate()
  const first = state.port.capture()
  for (const change of [
    () => { state.runtime.revision++ },
    () => { state.runtime.generation++ },
    () => { state.setLease(9) },
    () => { state.runtime.readOnly = true },
    () => { state.setAccess(false) },
    () => { state.root.isConnected = false },
  ]) {
    change()
    assert.equal(state.port.restore(first), false)
  }
  assert.deepEqual(state.applied, [])
})

test('bookmark restore preserves direction, is non-cumulative and adjusts only DOM-order end', () => {
  const state = fixture()
  state.setBookmark({
    anchor: { blockId: 'block', fieldKey: 'text', offset: 4 },
    focus: { blockId: 'block', fieldKey: 'text', offset: 1 },
  })
  state.port.activate()
  const token = state.port.capture()
  assert.ok(token)
  assert.throws(() => state.port.restore(token, { endOffsetDelta: 1 }), /active formatting mutation/)
  state.setMutation(true)
  assert.equal(state.port.restore(token, { endOffsetDelta: 1 }), true)
  assert.equal(state.port.restore(token, { endOffsetDelta: 1 }), true)
  assert.deepEqual(state.applied, [
    { anchor: { blockId: 'block', fieldKey: 'text', offset: 5 }, focus: { blockId: 'block', fieldKey: 'text', offset: 1 } },
    { anchor: { blockId: 'block', fieldKey: 'text', offset: 5 }, focus: { blockId: 'block', fieldKey: 'text', offset: 1 } },
  ])
})

test('invalid end adjustments have no effect and malformed options reject before any focus', () => {
  const state = fixture()
  state.port.activate()
  const token = state.port.capture()
  state.setMutation(true)
  for (const offset of [NaN, Infinity, 0.5, '1']) {
    assert.throws(() => state.port.restore(token, { endOffsetDelta: offset }), TypeError)
  }
  assert.equal(state.port.restore(token, { endOffsetDelta: 5 }), false)
  assert.equal(state.port.restore(token, { endOffsetDelta: -4 }), false)
  assert.deepEqual(state.applied, [])
})

test('read of caller-owned stale range cannot mint new rights', () => {
  const state = fixture()
  state.port.activate()
  const staleRange = {
    startContainer: state.text, startOffset: 0,
    endContainer: state.text, endOffset: 3,
  }
  assert.equal(state.port.capture(staleRange), null)
  const token = state.port.capture()
  assert.ok(token)
  const currentRange = state.port.range
  assert.notEqual(currentRange, null)
  assert.notEqual(currentRange, state.port.range)
})

test('widget-local range endpoints and surrogate-pair boundaries are rejected', () => {
  const state = fixture()
  state.port.activate()
  const widget = {
    nodeType: 1,
    closest(query) { return query === '[data-inline-plugin]' ? this : null },
  }
  state.setRange({
    startContainer: widget, startOffset: 0,
    endContainer: state.text, endOffset: 4,
    collapsed: false,
  })
  assert.equal(state.port.capture(), null)

  state.setRange({
    startContainer: state.text, startOffset: 1,
    endContainer: state.text, endOffset: 4,
    collapsed: false,
  })
  state.text.textContent = 'A😀Z'
  state.setBookmark({
    anchor: { blockId: 'block', fieldKey: 'text', offset: 2 },
    focus: { blockId: 'block', fieldKey: 'text', offset: 4 },
  })
  assert.equal(state.port.capture(), null)
})

test('a removed or renamed field rejects token restoration without fallback', () => {
  const state = fixture()
  state.port.activate()
  const token = state.port.capture()
  state.field.isConnected = false
  assert.equal(state.port.restore(token), false)
  assert.deepEqual(state.applied, [])
})

test('a model-first operation can validate but does not restore native selection', () => {
  const state = fixture()
  state.port.activate()
  const token = state.port.capture()
  assert.equal(state.port.isValid(token), true)
  assert.deepEqual(state.applied, [])
  state.runtime.revision += 1
  assert.equal(state.port.isValid(token), false)
  assert.deepEqual(state.applied, [])
})

test('successful own panel result retargets current keyed fields without restoring native focus', () => {
  const state = fixture()
  state.port.activate()
  const original = state.port.capture()
  assert.ok(original)
  state.runtime.revision++
  const result = {
    anchor: { blockId: 'block', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'block', fieldKey: 'text', offset: 4 },
  }
  const fresh = state.port.resolveOwnResult(result)
  assert.ok(fresh)
  assert.equal(fresh.startContainer, state.text)
  assert.equal(fresh.endOffset, 4)
  assert.deepEqual(state.applied, [])
  state.setRange(fresh)
  state.setBookmark(result)
  const next = state.port.capture()
  assert.ok(next)
  assert.equal(state.port.isValid(original), false)
  assert.equal(state.port.isValid(next), true)
})

