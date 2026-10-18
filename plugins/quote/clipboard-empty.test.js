import test from 'node:test'
import assert from 'node:assert/strict'
import { createQuotePlugin } from './index.js'

function ownerDocument() {
  return {
    createElement(tag) {
      assert.equal(tag, 'template')
      let html = ''
      return {
        set innerHTML(value) { html = String(value) },
        get content() { return { textContent: html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ') } },
      }
    },
  }
}

const quote = () => createQuotePlugin({ injectStyles: false }).capabilities.clipboard

function context(remainingHtml, caption = '') {
  return {
    ownerDocument: ownerDocument(),
    createId: prefix => prefix + '-1',
    field: key => key === 'text'
      ? { before: remainingHtml, selected: 'Alpha', after: '', whole: false }
      : key === 'caption' && caption
        ? { before: caption, selected: '', after: '', whole: false }
        : null,
  }
}

test('Quote Cut removes an author block whose only residual is visually empty markup', () => {
  const data = { text: '<strong>Alpha</strong>', caption: '' }
  for (const residual of ['<strong></strong>', '<br>', '&nbsp;']) {
    const sliced = quote().slice(data, context(residual))
    assert.deepEqual(sliced.parts, [{ kind: 'local-block', data: { text: 'Alpha', caption: '' } }])
    assert.equal(sliced.remaining, null, 'Quote left a visually empty block after Cut: ' + residual)
  }
})

test('Quote Cut retains meaningful rich-text residuals and an untouched caption', () => {
  const data = { text: '<b>Alpha</b>', caption: 'Author' }
  assert.deepEqual(quote().slice(data, context('<b>B</b>')).remaining,
    { text: '<b>B</b>', caption: 'Author' })
  assert.deepEqual(quote().slice(data, context('<b></b>')).remaining,
    { text: '<b></b>', caption: 'Author' },
    'a nonempty caption must prevent removal of the Quote block')
})
