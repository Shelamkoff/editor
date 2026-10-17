import test from 'node:test'
import assert from 'node:assert/strict'
import { LogicalSelection } from './LogicalSelection.js'

function harness() {
  const calls = []
  const focusCalls = []
  const native = {
    anchorNode: null, focusNode: null,
    setBaseAndExtent(anchor, anchorOffset, focus, focusOffset) {
      calls.push({ anchor, anchorOffset, focus, focusOffset })
      this.anchorNode = anchor
      this.focusNode = focus
    },
    removeAllRanges() { this.anchorNode = this.focusNode = null },
  }
  const doc = {
    activeElement: null,
    defaultView: { getSelection: () => native },
  }
  const text = {
    nodeType: 3, textContent: 'Alpha', childNodes: [], parentElement: null,
  }
  const field = {
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: doc,
    childNodes: [text],
    hasAttribute() { return false },
    contains(node) { return node === this || node === text },
    focus() { doc.activeElement = this },
  }
  text.parentNode = field
  text.parentElement = field

  const block = { contains: node => node === field || node === text }
  const reconciler = {
    getEditableFields(id) {
      return id === 'a'
        ? [{ key: 'title', mode: 'rich-text', element: field }]
        : []
    },
    getElement: id => id === 'a' ? block : null,
    resolveEditableTarget() { return null },
    resolveBlockTarget() { return null },
    focus(id, target) { focusCalls.push({ id, target }); return false },
  }
  const root = {
    ownerDocument: doc,
    contains: node => node === field || node === text,
  }
  const selection = new LogicalSelection({ root, reconciler })
  const bookmark = key => ({
    anchor: { blockId: 'a', fieldKey: key, offset: 2 },
    focus: { blockId: 'a', fieldKey: key, offset: 2 },
  })
  return { calls, focusCalls, native, field, doc, selection, bookmark }
}

test('restoring a deleted rich-text field never redirects the caret to a different field', () => {
  const h = harness()
  assert.equal(h.selection.restore(h.bookmark('deleted-caption')), false,
    'stale field bookmark unexpectedly succeeded by focusing the title field')
  assert.deepEqual(h.calls, [], 'stale field caret changed native selection')
  assert.equal(h.doc.activeElement, null)
})

test('mixed valid and retired bookmark endpoints fail before plugin focus side effects', () => {
  const h = harness()
  const bookmark = {
    anchor: { blockId: 'a', fieldKey: 'title', offset: 1 },
    focus: { blockId: 'a', fieldKey: 'removed-caption', offset: 2 },
  }
  assert.equal(h.selection.restore(bookmark), false)
  assert.deepEqual(h.focusCalls, [],
    'failed selection restoration invoked a plugin focus on its valid endpoint')
  assert.deepEqual(h.calls, [])
  assert.equal(h.doc.activeElement, null)
})

test('a currently registered field can still restore the exact logical caret', () => {
  const h = harness()
  assert.equal(h.selection.restore(h.bookmark('title')), true)
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].anchorOffset, 2)
  assert.equal(h.calls[0].focusOffset, 2)
  assert.equal(h.doc.activeElement, h.field)
})

test('explicitly missing field does not clear an existing native selection', () => {
  const h = harness()
  const initialAnchor = h.field.childNodes[0]
  h.native.anchorNode = initialAnchor
  h.native.focusNode = initialAnchor

  assert.equal(h.selection.setCaret('a', {
    fieldKey: 'deleted-caption', offset: 2,
  }), false)
  assert.equal(h.native.anchorNode, initialAnchor,
    'failed caret request cleared the existing author selection')
  assert.equal(h.native.focusNode, initialAnchor)
  assert.deepEqual(h.calls, [])
})

test('setCaret with unknown field refuses the request instead of focusing a sibling', () => {
  const h = harness()
  assert.equal(h.selection.setCaret('a', { fieldKey: 'deleted-caption', offset: 2 }), false)
  assert.deepEqual(h.calls, [])
  assert.equal(h.doc.activeElement, null)
})
