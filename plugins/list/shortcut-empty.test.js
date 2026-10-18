import { createListPlugin } from './index.js'

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

test('List Enter exits rich-text-only blank using the editor owning document', () => {
  const shortcut = createListPlugin({ injectStyles: false }).capabilities.shortcuts
  for (const html of ['<br>', '<strong></strong>', '&nbsp;']) {
    const data = { style: 'unordered', items: [{ id: 'only', text: html }] }
    assert.deepEqual(shortcut.handle(enter('item:only'), data, {
      ownerDocument: ownerDocument(),
      createId() { throw new Error('blank list must not split') },
    }), { kind: 'exit' }, 'HTML-only blank item should exit: ' + html)
  }
})

test('List Enter removes a visually blank trailing row and retains numbering', () => {
  const shortcut = createListPlugin({ injectStyles: false }).capabilities.shortcuts
  const data = { style: 'ordered', items: [{ id: 'first', text: 'Alpha' }, { id: 'last', text: '<br>' }] }
  assert.deepEqual(shortcut.handle(enter('item:last'), data, {
    ownerDocument: ownerDocument(),
    createId() { throw new Error('blank list must not split') },
  }), { kind: 'exit', data: { style: 'ordered', items: [{ id: 'first', text: 'Alpha' }] } })
})
