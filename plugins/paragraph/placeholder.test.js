// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createParagraphPlugin } from './index.js'

function mount(config, editorPlaceholder, translatedPlaceholder = 'Translated placeholder') {
  const ownerDocument = {
    createElement() {
      return {
        ownerDocument,
        contentEditable: 'inherit',
        dataset: {},
        className: '',
        innerHTML: '',
        textContent: '',
        focus() {},
      }
    },
  }
  const definition = createParagraphPlugin(config)
  const runtime = definition.setup({
    ownerDocument,
    signal: new AbortController().signal,
    isDefaultBlock: true,
    editorPlaceholder,
    t: (_key, fallback = '') => translatedPlaceholder || fallback,
  })
  const data = { text: '' }
  const instance = runtime.create(data, {
    ownerDocument,
    signal: new AbortController().signal,
    createId: prefix => prefix + '-1',
    getData: () => data,
    updateData() {},
    commitDomMutation(operation) { operation() },
    requestSplit() {},
    requestExit() {},
    isReadOnly: () => false,
  })
  return { instance, runtime }
}

test('Paragraph preserves an explicit plugin placeholder over the editor placeholder', () => {
  const f = mount({ placeholder: 'Plugin placeholder' }, 'Editor placeholder')
  assert.equal(f.instance.element.dataset.placeholder, 'Plugin placeholder')
  f.instance.destroy(); f.runtime.destroy()
})

test('Paragraph accepts an empty plugin placeholder as an explicit override', () => {
  const f = mount({ placeholder: '' }, 'Editor placeholder')
  assert.equal(Object.hasOwn(f.instance.element.dataset, 'placeholder'), false)
  f.instance.destroy(); f.runtime.destroy()
})

test('Paragraph accepts an empty editor placeholder as an explicit override over translations', () => {
  const f = mount({}, '', 'Translated placeholder')
  assert.equal(Object.hasOwn(f.instance.element.dataset, 'placeholder'), false)
  f.instance.destroy(); f.runtime.destroy()
})
