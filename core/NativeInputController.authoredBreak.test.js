import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeInputController } from './NativeInputController.js'
import { projectRichTextCaretPadding } from '../shared/richTextCaretPadding.js'

function fixture() {
  const commits = [], inserted = []
  let refreshed = 0, prevented = 0, stopped = 0
  const element = tag => ({ nodeType: 1, nodeName: tag, tagName: tag, childNodes: [], parentNode: null,
    hasAttribute() { return false }, setAttribute() {}, querySelectorAll() { return [] },
    contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false },
    insertBefore(node, next) { node.parentNode = this; this.childNodes.splice(next ? this.childNodes.indexOf(next) : this.childNodes.length, 0, node) },
  })
  const field = element('P'), mark = element('B'), br = element('BR')
  field.childNodes = [mark]; mark.parentNode = field; mark.childNodes = [br]; br.parentNode = mark
  let owner = { blockId: 'a', fieldKey: 'text', mode: 'rich-text', element: field }
  const closest = selector => selector === '[contenteditable="true"]' ? field : null
  field.closest = mark.closest = closest
  const range = { collapsed: true, startContainer: mark, startOffset: 1, insertNode(node) { inserted.push(node.data) } }
  const native = { isCollapsed: true, rangeCount: 1, anchorNode: mark, focusNode: mark, anchorOffset: 1, focusOffset: 1,
    getRangeAt() { return range }, setBaseAndExtent(node, offset) { this.anchorNode = this.focusNode = node; this.anchorOffset = this.focusOffset = offset },
  }
  const document = { activeElement: field, defaultView: { getSelection: () => native, AbortController },
    createTextNode: data => ({ data }), createElement: element,
  }
  field.ownerDocument = mark.ownerDocument = br.ownerDocument = document
  const point = { blockId: 'a', fieldKey: 'text', offset: 1 }, bookmark = { anchor: point, focus: { ...point } }
  const selection = { capture: () => bookmark }
  const runtime = { readOnly: false, syncBlockFromProjection(id, operation, metadata) { operation(); commits.push({ id, metadata }) } }
  const controller = new NativeInputController({
    root: { ownerDocument: document, addEventListener() {}, contains: node => field.contains(node) }, runtime,
    reconciler: { resolveEditableTarget: () => owner }, selection, onControlledInput: () => refreshed++,
  })
  const event = { type: 'beforeinput', inputType: 'insertText', data: 'Y', target: field,
    cancelable: true, isTrusted: true, isComposing: false,
    preventDefault() { prevented++ }, stopImmediatePropagation() { stopped++ },
  }
  return { controller, event, native, range, document, field, mark, br, selection, runtime, owner, bookmark, element,
    setOwner(value) { owner = value }, outcome: () => ({ commits, inserted, refreshed, prevented, stopped }) }
}

test('trusted input after an authored BR uses one existing native history commit', () => {
  const h = fixture()
  h.controller.handleBeforeInput(h.event)
  const result = h.outcome()
  assert.deepEqual(result.inserted, ['Y'])
  assert.equal(result.prevented, 1); assert.equal(result.stopped, 1); assert.equal(result.refreshed, 1)
  assert.equal(result.commits.length, 1)
  assert.deepEqual(result.commits[0], { id: 'a', metadata: { origin: 'native-input', name: 'native-input',
    historyGroup: 'native:a:text:1', coalesce: true, preserveSourceProjection: true, selectionBefore: h.bookmark } })
  h.controller.destroy()
})

for (const [name, alter] of [
  ['untrusted', h => { h.event.isTrusted = false }],
  ['uncancelable', h => { h.event.cancelable = false }],
  ['composition input', h => { h.event.isComposing = true }],
  ['composition input type', h => { h.event.inputType = 'insertCompositionText' }],
  ['replacement text', h => { h.event.inputType = 'insertReplacementText' }],
  ['paste', h => { h.event.inputType = 'insertFromPaste' }],
  ['drop', h => { h.event.inputType = 'insertFromDrop' }],
  ['empty text', h => { h.event.data = '' }],
  ['non-beforeinput event', h => { h.event.type = 'input' }],
  ['noncollapsed selection', h => { h.native.isCollapsed = false }],
  ['noncollapsed live range', h => { h.range.collapsed = false }],
  ['read-only field', h => { h.runtime.readOnly = true }],
  ['plain-text owner', h => { h.owner.mode = 'plain-text' }],
  ['native textarea target', h => { const control = h.element('TEXTAREA'); control.parentNode = h.field; control.closest = selector => selector.startsWith('input,') ? control : h.field; h.event.target = control }],
  ['locked boundary', h => { h.mark.closest = selector => selector === '[contenteditable="false"]' ? h.mark : selector === '[contenteditable="true"]' ? h.field : null }],
  ['nested host boundary', h => { h.mark.closest = selector => selector === '[contenteditable="true"]' ? h.mark : null }],
  ['external boundary', h => { h.mark.parentNode = null }],
  ['retired owner during capture', h => { h.selection.capture = () => { h.setOwner({ ...h.owner, element: h.element('P') }); return h.bookmark } }],
  ['foreign current focus', h => { h.document.activeElement = h.element('TEXTAREA') }],
  ['text boundary', h => { h.br.nodeName = h.br.tagName = 'SPAN' }],
  ['destroyed owner', h => { h.controller.destroy() }],
  ['terminal padding follows caret', h => { projectRichTextCaretPadding(h.field) }],
  ['padding precedes caret', h => { projectRichTextCaretPadding(h.field); h.native.anchorOffset = h.native.focusOffset = h.range.startOffset = 2 }],
]) test(`authored BR typing leaves ${name} with its existing owner`, () => {
  const h = fixture(); alter(h)
  h.controller.handleBeforeInput(h.event)
  assert.deepEqual(h.outcome(), { commits: [], inserted: [], refreshed: 0, prevented: 0, stopped: 0 })
  h.controller.destroy()
})
