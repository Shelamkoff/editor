import test from 'node:test'
import assert from 'node:assert/strict'

import { InlineSelectionAuthority } from './InlineSelectionAuthority.js'

function fixture({ onReadSelection = null } = {}) {
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
    contentEditable: 'true',
    hidden: false,
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
    readSelection: () => {
      onReadSelection?.()
      return { range, bookmark }
    },
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

test('scoped restore preserves the owner-defined converted-range caret presentation', () => {
  const state = fixture()
  state.setBookmark({
    anchor: { blockId: 'block', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'block', fieldKey: 'text', offset: 4 },
    conversionCaret: true,
  })
  state.port.activate()
  const token = state.port.capture()
  assert.equal(state.port.restore(token), true)
  assert.deepEqual(state.applied, [{
    anchor: { blockId: 'block', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'block', fieldKey: 'text', offset: 4 },
    conversionCaret: true,
  }])
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


test('native selection drift rejects an old token before a queued selectionchange event', () => {
  const state = fixture()
  state.port.activate()
  const token = state.port.capture()
  assert.ok(token)
  state.setRange({
    startContainer: state.text, startOffset: 0,
    endContainer: state.text, endOffset: 3,
    collapsed: false,
    cloneRange() { return { ...this } },
    compareBoundaryPoints(which, expected) {
      return which === 0
        ? this.startOffset - expected.startOffset
        : this.endOffset - expected.endOffset
    },
  })
  state.setBookmark({
    anchor: { blockId: 'block', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'block', fieldKey: 'text', offset: 3 },
  })
  assert.equal(state.port.isValid(token), false)
  assert.equal(state.port.restore(token), false)
  assert.deepEqual(state.applied, [])
})

test('a mismatched native range cannot be used to mint a fresh logical token', () => {
  const state = fixture()
  state.port.activate()
  state.setRange({
    startContainer: state.text, startOffset: 0,
    endContainer: state.text, endOffset: 3,
    collapsed: false,
    compareBoundaryPoints(which, expected) {
      return which === 0
        ? this.startOffset - expected.startOffset
        : this.endOffset - expected.endOffset
    },
    cloneRange() { return { ...this } },
  })
  assert.equal(state.port.range, null)
  assert.equal(state.port.capture(), null)
  assert.deepEqual(state.applied, [])
})

test('hidden and no-longer-editable rich fields cannot receive scoped restorations', () => {
  const state = fixture()
  state.port.activate()
  const token = state.port.capture()
  assert.ok(token)
  state.field.hidden = true
  assert.equal(state.port.restore(token), false)
  assert.equal(state.port.range, null)
  state.field.hidden = false
  state.field.contentEditable = 'false'
  assert.equal(state.port.restore(token), false)
  assert.equal(state.port.capture(), null)
  assert.deepEqual(state.applied, [])
})
test('revoked selection owner cannot return a retained range after health observation', () => {
  const state = fixture()
  state.port.activate()
  Object.defineProperty(state.runtime, 'health', {
    configurable: true,
    get() {
      state.port.revoke()
      return 'ready'
    },
  })
  assert.equal(state.port.range, null,
    'a runtime health callback retired the range owner during its admission')
})

test('inline selection capture cannot mint authority after scope revocation in preparation', () => {
  const state = fixture()
  state.port.activate()
  state.runtime.prepareExtensionValue = operation => {
    state.port.revoke()
    return operation()
  }
  assert.equal(state.port.capture(), null,
    'capture issued a token after its plugin preparation revoked its owner')
})

test('inline selection resolution cannot return a range after its preparation revokes scope', () => {
  const state = fixture()
  state.port.activate()
  state.runtime.prepareExtensionValue = operation => {
    state.port.revoke()
    return operation()
  }
  const bookmark = {
    anchor: { blockId: 'block', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'block', fieldKey: 'text', offset: 4 },
  }
  assert.equal(state.port.resolveOwnResult(bookmark), null,
    'a retired plugin was handed a fresh editable DOM range')
})

test('inline range access cannot return a selection after native read revokes its owner', () => {
  let state
  state = fixture({ onReadSelection: () => state.port.revoke() })
  state.port.activate()
  assert.equal(state.port.range, null,
    'the native reader retired the authority but a range was still returned')
})

test('inline token validity cannot survive revocation from an endpoint check', () => {
  const state = fixture()
  state.port.activate()
  const token = state.port.capture()
  assert.ok(token)
  const closest = state.field.closest
  let invoked = 0
  state.field.closest = (...args) => {
    if (++invoked === 1) state.port.revoke()
    return closest.apply(state.field, args)
  }
  assert.equal(state.port.isValid(token), false,
    'endpoint metadata observer retired the owner while its old token stayed valid')
  assert.equal(invoked > 0, true)
})
test('inline restore cannot move native selection after its final reader revokes authority', () => {
  const state = fixture()
  state.port.activate()
  const token = state.port.capture()
  assert.ok(token)
  const normalPrepare = state.runtime.prepareExtensionValue
  const oldClosest = state.field.closest
  let revokedDuringFinalRead = false
  state.runtime.prepareExtensionValue = operation => {
    const result = normalPrepare(operation)
    // The candidate has been calculated, but its final native-selection
    // verification has not yet begun.
    state.field.closest = (...args) => {
      if (!revokedDuringFinalRead) {
        revokedDuringFinalRead = true
        state.port.revoke()
      }
      return oldClosest.apply(state.field, args)
    }
    return result
  }
  assert.equal(state.port.restore(token), false,
    'a native selection read revoked the owner immediately before stale focus restoration')
  assert.equal(revokedDuringFinalRead, true)
  assert.deepEqual(state.applied, [],
    'a callback moved the caret after its owning inline presentation was destroyed')
})
test('inline selection capture refuses a token invalidated during revision observation', () => {
  for (const retirement of ['generation', 'lease']) {
    const state = fixture()
    state.port.activate()
    let observed = 0
    Object.defineProperty(state.runtime, 'revision', {
      configurable: true,
      get() {
        observed++
        if (observed === 1) {
          if (retirement === 'generation') state.runtime.generation++
          else state.setLease(8)
        }
        return 2
      },
    })
    assert.equal(state.port.capture(), null,
      retirement + ' changed while capture built its token; stale rights escaped')
    assert.equal(observed > 0, true)
  }
})
