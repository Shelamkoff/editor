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
      this.anchorNode = startNode
      this.focusNode = endNode
      this.anchorOffset = startOffset
      this.focusOffset = endOffset
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


test('rich-text restore reports retirement during native selection application', () => {
  let h
  h = fixture({ onSelection() { h.replaceField() } })
  const original = h.field().element
  assert.equal(h.selection.restore(h.bookmark), false,
    'native selection callback replaced the field but old restore reported success')
  assert.notEqual(h.field().element, original)
  assert.equal(h.nativeEvents.length, 1)
})

test('collapsed native selection callback cannot report an older editor focus as accepted', () => {
  let h
  const newer = { id: 'newer-native-focus' }
  h = fixture({ onSelection() { h.ownerDocument.activeElement = newer } })
  assert.equal(h.selection.restore(h.bookmark), false,
    'native selection callback transferred author focus but old restore reported success')
  assert.equal(h.ownerDocument.activeElement, newer)
})


test('fieldless block focus cannot claim a replaced shell with the same ID', () => {
  const doc = { activeElement: null, defaultView: { getSelection() { return null } } }
  let current
  const original = {
    focus() {
      doc.activeElement = this
      current = { focus() { doc.activeElement = this } }
    },
  }
  current = original
  const reconciler = {
    resolveEditableTarget() { return null },
    getEditableFields() { return [] },
    getElement(id) { return id === 'a' ? current : null },
  }
  const logical = new LogicalSelection({ root: { ownerDocument: doc }, reconciler })
  const point = { blockId: 'a', fieldKey: '', offset: 0 }
  assert.equal(logical.restore({ anchor: point, focus: { ...point } }), false,
    'fieldless focus accepted a detached shell that reused the original block ID')
  assert.notEqual(current, original)
})

test('fieldless block focus failure is reported without leaking an exception', () => {
  const doc = { activeElement: null, defaultView: { getSelection() { return null } } }
  const reconciler = {
    resolveEditableTarget() { return null },
    getEditableFields() { return [] },
    getElement() { return { focus() { throw new Error('host was detached') } } },
  }
  const logical = new LogicalSelection({ root: { ownerDocument: doc }, reconciler })
  const point = { blockId: 'a', fieldKey: '', offset: 0 }
  assert.equal(logical.restore({ anchor: point, focus: { ...point } }), false)
})

test('plain-text capture does not return an owner retired during target resolution', () => {
  const doc = { activeElement: null, defaultView: { getSelection() { return null } } }
  const original = { selectionStart: 1, selectionEnd: 1, selectionDirection: 'forward' }
  const newer = { selectionStart: 3, selectionEnd: 3 }
  doc.activeElement = original
  const reconciler = {
    resolveEditableTarget(element) {
      if (element === original) {
        doc.activeElement = newer
        return { blockId: 'a', fieldKey: 'text', mode: 'plain-text', element: original }
      }
      return null
    },
  }
  const logical = new LogicalSelection({ root: { ownerDocument: doc }, reconciler })
  assert.equal(logical.capture(), null,
    'selection snapshot retained the old plain-text field after a newer focus')
})

test('plain-text selection getters cannot return a bookmark after focus changes', () => {
  const doc = { activeElement: null, defaultView: { getSelection() { return null } } }
  const newer = { value: 'newer' }
  const original = {
    get selectionStart() {
      doc.activeElement = newer
      return 2
    },
    selectionEnd: 4,
    selectionDirection: 'forward',
  }
  doc.activeElement = original
  const reconciler = {
    resolveEditableTarget(element) {
      return element === original
        ? { blockId: 'a', fieldKey: 'code', mode: 'plain-text', element: original }
        : null
    },
  }
  const logical = new LogicalSelection({ root: { ownerDocument: doc }, reconciler })
  assert.equal(logical.capture(), null,
    'selection getter switched active field but old field was still captured')
})

test('rich-text capture rejects native selection changed during endpoint resolution', () => {
  const text = { nodeType: 3, textContent: 'Alpha', data: 'Alpha' }
  const rootField = {
    nodeType: 1, childNodes: [text],
    contains(node) { return node === this || node === text },
    hasAttribute() { return false },
  }
  text.parentNode = rootField
  const native = {
    anchorNode: text, focusNode: text, anchorOffset: 1, focusOffset: 1,
  }
  const doc = {
    activeElement: rootField,
    defaultView: { getSelection() { return native } },
  }
  let resolutions = 0
  const reconciler = {
    resolveEditableTarget(node) {
      if (node === text) {
        if (++resolutions === 1) native.focusOffset = 4
        return { blockId: 'a', fieldKey: 'text', mode: 'rich-text', element: rootField }
      }
      return null
    },
  }
  const logical = new LogicalSelection({ root: { ownerDocument: doc }, reconciler })
  assert.equal(logical.capture(), null,
    'mixed native endpoints from different selection moments became one bookmark')
})


test('backward rich-text selection uses native collapse and extend when setBaseAndExtent is missing', () => {
  const h = fixture()
  const native = h.native
  native.setBaseAndExtent = undefined
  native.collapse = (node, offset) => {
    native.anchorNode = node
    native.focusNode = node
    native.anchorOffset = offset
    native.focusOffset = offset
  }
  native.extend = (node, offset) => {
    native.focusNode = node
    native.focusOffset = offset
  }
  // Mimic DOM Range's forward-only behavior: setting an end before a start
  // collapses the range to the new end, losing backwards selection.
  h.ownerDocument.createRange = () => ({
    startNode: null, endNode: null, startOffset: 0, endOffset: 0,
    setStart(node, offset) { this.startNode = node; this.startOffset = offset },
    setEnd(node, offset) {
      this.endNode = node
      this.endOffset = offset
      if (offset < this.startOffset) this.startOffset = offset
    },
  })
  native.addRange = range => {
    native.anchorNode = range.startNode
    native.focusNode = range.endNode
    native.anchorOffset = range.startOffset
    native.focusOffset = range.endOffset
  }
  const point = offset => ({ blockId: 'a', fieldKey: 'text', offset })
  assert.equal(h.selection.restore({
    anchor: point(4), focus: point(1),
  }), true)
  assert.equal(native.anchorOffset, 4, 'backward selection lost its original anchor')
  assert.equal(native.focusOffset, 1, 'backward selection collapsed instead of selecting text')
  assert.equal(native.anchorNode, h.field().child)
  assert.equal(native.focusNode, h.field().child)
})

test('forward rich-text Range fallback still restores text when Selection.extend is unavailable', () => {
  const h = fixture()
  const native = h.native
  native.setBaseAndExtent = undefined
  native.collapse = undefined
  native.extend = undefined
  h.ownerDocument.createRange = () => ({
    startNode: null, endNode: null, startOffset: 0, endOffset: 0,
    setStart(node, offset) { this.startNode = node; this.startOffset = offset },
    setEnd(node, offset) { this.endNode = node; this.endOffset = offset },
  })
  native.addRange = range => {
    native.anchorNode = range.startNode
    native.focusNode = range.endNode
    native.anchorOffset = range.startOffset
    native.focusOffset = range.endOffset
  }
  const point = offset => ({ blockId: 'a', fieldKey: 'text', offset })
  assert.equal(h.selection.restore({
    anchor: point(1), focus: point(4),
  }), true)
  assert.deepEqual([native.anchorOffset, native.focusOffset], [1, 4])
})

test('rich-text restore must reject a native setter that silently fails', () => {
  const h = fixture()
  h.native.setBaseAndExtent = () => {
    // Native selection APIs can return without a throw even when the DOM
    // selection cannot be installed in a disconnected/detached host.
  }
  assert.equal(h.selection.restore(h.bookmark), false,
    'restore reported successful caret ownership without a native selection')
  assert.equal(h.native.anchorNode, null)
  assert.equal(h.native.focusNode, null)
})

test('native selection callback moving the caret inside the same host supersedes restore', () => {
  let h
  h = fixture({
    onSelection() {
      h.native.anchorOffset = 4
      h.native.focusOffset = 4
    },
  })
  assert.equal(h.selection.restore(h.bookmark), false,
    'restore claimed an old offset after a newer same-field native caret move')
  assert.equal(h.ownerDocument.activeElement, h.field().element)
  assert.deepEqual([h.native.anchorOffset, h.native.focusOffset], [4, 4])
})

test('plain-text setSelectionRange that silently fails does not claim a caret', () => {
  const h = fixture({ mode: 'plain-text' })
  h.field().element.selectionStart = 0
  h.field().element.selectionEnd = 0
  h.field().element.setSelectionRange = () => {}
  assert.equal(h.selection.restore(h.bookmark), false,
    'plain-text DOM input never changed its selection but restore returned true')
  assert.deepEqual([h.field().element.selectionStart, h.field().element.selectionEnd], [0, 0])
})
