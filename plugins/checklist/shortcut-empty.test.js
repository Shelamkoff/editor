import { createChecklistPlugin } from './index.js'

import test from 'node:test'
import assert from 'node:assert/strict'

// An owning Document may be an iframe document; do not borrow global document.
// The narrow template simulates its text projection for simple HTML marks.
function ownerDocument() {
  return {
    createElement(tag) {
      assert.equal(tag, 'template')
      let html = ''
      return {
        set innerHTML(value) { html = String(value) },
        get content() {
          return { textContent: html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ') }
        },
      }
    },
  }
}

const enter = fieldKey => ({
  key: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
  fieldKey, fieldLength: 0, selection: { start: 0, end: 0 },
})

test('Checklist Enter exits a visually empty rich-text item, not a literal HTML string', () => {
  const shortcut = createChecklistPlugin({ injectStyles: false }).capabilities.shortcuts
  const owner = ownerDocument()
  for (const html of ['<br>', '<strong></strong>', '&nbsp;']) {
    const data = { items: [{ id: 'only', text: html, checked: false }] }
    assert.deepEqual(shortcut.handle(enter('item:only'), data, {
      ownerDocument: owner,
      createId() { throw new Error('empty item must not split') },
    }), { kind: 'exit' }, 'HTML-only blank item should exit: ' + html)
  }
})

test('Checklist Enter on the last visually blank item retains earlier checked entries', () => {
  const shortcut = createChecklistPlugin({ injectStyles: false }).capabilities.shortcuts
  const data = { items: [
    { id: 'first', text: 'Alpha', checked: true },
    { id: 'last', text: '<br>', checked: false },
  ] }
  assert.deepEqual(shortcut.handle(enter('item:last'), data, {
    ownerDocument: ownerDocument(),
    createId() { throw new Error('empty item must not split') },
  }), { kind: 'exit', data: { items: [data.items[0]] } })
})

test('Checklist Enter continues splitting visibly nonempty rich text', () => {
  const shortcut = createChecklistPlugin({ injectStyles: false }).capabilities.shortcuts
  const data = { items: [{ id: 'first', text: '<b>Alpha</b>', checked: true }] }
  assert.deepEqual(shortcut.handle(enter('item:first'), data, {
    ownerDocument: ownerDocument(),
    createId: () => 'second',
    splitField: () => ({ before: '<b>Al</b>', after: '<b>pha</b>' }),
  }), { kind: 'update', data: { items: [
    { id: 'first', text: '<b>Al</b>', checked: true },
    { id: 'second', text: '<b>pha</b>', checked: false },
  ] }, focus: { fieldKey: 'item:second', offset: 'start' } })
})
