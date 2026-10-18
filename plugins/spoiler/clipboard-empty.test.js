import test from 'node:test'
import assert from 'node:assert/strict'
import { createSpoilerPlugin } from './index.js'

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

const slice = () => createSpoilerPlugin({ injectStyles: false }).capabilities.clipboard.slice
function context(leftover, untouched = '') {
  return {
    ownerDocument: ownerDocument(),
    createId: prefix => prefix + '-1',
    field(key) {
      if (key === 'label') return {
        before: leftover, selected: 'Author', after: '', whole: false,
      }
      if (key === 'content' && untouched) return {
        before: untouched, selected: '', after: '', whole: false,
      }
      return null
    },
  }
}

test('spoiler Cut removes a visually empty HTML residual block', () => {
  const original = { label: '<b>Author</b>', content: '' }
  for (const html of ['<strong></strong>', '<br>', '&nbsp;']) {
    const result = slice()(original, context(html))
    assert.equal(result.parts.length, 1)
    assert.equal(result.parts[0].kind, 'local-block')
    assert.equal(result.remaining, null,
      'spoiler retained a block containing only invisible HTML: ' + html)
  }
})

test('spoiler Cut keeps visible residual text and untouched secondary content', () => {
  const original = { label: '<b>Author</b>', content: 'Secondary' }
  const visible = slice()(original, context('<b>Visible</b>'))
  assert.deepEqual(visible.remaining, { label: '<b>Visible</b>', content: 'Secondary' })
  const titleBlank = slice()(original, context('<b></b>'))
  assert.deepEqual(titleBlank.remaining, { label: '<b></b>', content: 'Secondary' })
})
