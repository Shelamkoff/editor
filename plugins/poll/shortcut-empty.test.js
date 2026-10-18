import test from 'node:test'
import assert from 'node:assert/strict'
import { createPollPlugin } from './index.js'

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

const backspace = key => ({
  key: 'Backspace', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
  fieldKey: key, fieldLength: 0, selection: { start: 0, end: 0 },
})

test('Poll Backspace removes a visually empty HTML option as v1 does', () => {
  const capability = createPollPlugin({ injectStyles: false }).capabilities.shortcuts
  for (const html of ['<br>', '<strong></strong>', '&nbsp;']) {
    const data = {
      question: 'Question', type: 'single', resultsMode: 'always',
      options: [
        { id: 'first', text: 'Alpha' },
        { id: 'empty', text: html },
        { id: 'last', text: 'Bravo' },
      ],
    }
    const result = capability.handle(backspace('option:empty'), data, {
      ownerDocument: ownerDocument(),
      fieldLength: key => key === 'option:first' ? 5 : 0,
    })
    assert.deepEqual(result, {
      kind: 'update',
      data: { ...data, options: [data.options[0], data.options[2]] },
      focus: { fieldKey: 'option:first', offset: 5 },
    }, 'HTML-only blank Poll option should be removed: ' + html)
  }
})

test('Poll Backspace does not remove a visually nonempty option or violate two-option minimum', () => {
  const capability = createPollPlugin({ injectStyles: false }).capabilities.shortcuts
  const items = [
    { id: 'first', text: '<b>Alpha</b>' },
    { id: 'second', text: '<br>' },
    { id: 'third', text: 'Charlie' },
  ]
  const data = { question: 'Question', type: 'single', resultsMode: 'always', options: items }
  assert.deepEqual(capability.handle(backspace('option:first'), data, {
    ownerDocument: ownerDocument(),
  }), { kind: 'native' })
  assert.deepEqual(capability.handle(backspace('option:second'), {
    ...data, options: items.slice(0, 2),
  }, { ownerDocument: ownerDocument() }), { kind: 'native' })
})
