import test from 'node:test'
import assert from 'node:assert/strict'
import { LogicalSelection } from './LogicalSelection.js'

function fixture({ mode = 'rich-text', onFocus = null, onSelection = null } = {}) {
  const nativeEvents = []
  const native = {
    anchorNode: null,
    focusNode: null,
    setBaseAndExtent(startNode, startOffset, endNode, endOffset) {
      nativeEvents.push({ startNode, startOffset, endNode, endOffset })
      onSelection?.()
    },
    removeAllRanges() {},
  }
  const ownerDocument = {
    activeElement: null,
    defaultView: { getSelection: () => native },
  }
  let field
  const makeField = (suffix = '') => {
    const element = {
      nodeType: 1, tagName: mode === 'plain-text' ? 'INPUT' : 'DIV',
      childNodes: [], value: 'Alpha', hasAttribute() { return false },
      contains(node) { return node === this || node.parentNode === this },
      focus() {
        ownerDocument.activeElement = this
        onFocus?.(element, replaceField, ownerDocument)
      },
      setSelectionRange(start, end, direction) {
        this.selectionStart = start
        this.selectionEnd = end
        this.selectionDirection = direction
      },
    }
    const child = { nodeType: 3, textContent: 'Alpha', data: 'Alpha', parentNode: element }
    element.childNodes = [child]
    element.textContent = 'Alpha'
    element.suffix = suffix
    return { key: 'text', mode, element, child }
  }
  field = makeField()
  const replaceField = () => { field = makeField('replacement'); return field }
  const reconciler = {
    resolveEditableTarget() { return null },
    getEditableFields(id) { return id === 'a' ? [field] : [] },
    focus() { field.element.focus(); return true },
  }
  const selection = new LogicalSelection({
    root: { ownerDocument, contains: () => true },
    reconciler,
  })
  const point = { blockId: 'a', fieldKey: 'text', offset: 2 }
  const bookmark = { anchor: point, focus: { ...point } }
  // Native host is already active so restore proceeds directly to focusing
  // the editable field and then choosing its text range.
  ownerDocument.activeElement = field.element
  return { selection, nativeEvents, native, reconciler, field: () => field, replaceField, ownerDocument, bookmark }
}

test('rich-text restore refuses nodes from a field replaced during native focus', () => {
  let displaced = false
  const h = fixture({ onFocus(_element, replace) {
    if (!displaced) { displaced = true; replace() }
  } })
  const old = h.field().element
  assert.equal(h.selection.restore(h.bookmark), false,
    'logical restore succeeded with a detached pre-remount text node')
  assert.notEqual(h.field().element, old)
  assert.equal(h.nativeEvents.length, 0,
    'native selection was placed inside a retired DOM field')
})

test('plain-text restore does not write a selection range into a remounted input', () => {
  let switched = false
  const h = fixture({ mode: 'plain-text', onFocus(_element, replace) {
    if (!switched) { switched = true; replace() }
  } })
  const old = h.field().element
  let selections = 0
  old.setSelectionRange = () => { selections++ }
  assert.equal(h.selection.restore(h.bookmark), false)
  assert.equal(selections, 0, 'a retired input was given an old selection range')
})

test('rich-text restore preserves a newer native focus acquired inside its focus listener', () => {
  const newer = { id: 'newer-input' }
  const h = fixture({ onFocus(_element, _replace, document) { document.activeElement = newer } })
  assert.equal(h.selection.restore(h.bookmark), false,
    'native author focus moved elsewhere but old caret was restored')
  assert.equal(h.nativeEvents.length, 0)
  assert.equal(h.ownerDocument.activeElement, newer)
})

test('plain-text restore contains setSelectionRange failure without reporting false success', () => {
  const h = fixture({ mode: 'plain-text' })
  h.field().element.setSelectionRange = () => { throw new Error('input was removed during caret update') }
  assert.equal(h.selection.restore(h.bookmark), false)
})

test('stable rich-text field restores its logical offset', () => {
  const h = fixture()
  assert.equal(h.selection.restore(h.bookmark), true)
  assert.equal(h.nativeEvents.length, 1)
  assert.equal(h.nativeEvents[0].startNode, h.field().child)
  assert.equal(h.nativeEvents[0].startOffset, 2)
  assert.equal(h.nativeEvents[0].endOffset, 2)
})

test('stable plain-text field restores its selection start and end', () => {
  const h = fixture({ mode: 'plain-text' })
  assert.equal(h.selection.restore(h.bookmark), true)
  assert.deepEqual([h.field().element.selectionStart, h.field().element.selectionEnd], [2, 2])
})
