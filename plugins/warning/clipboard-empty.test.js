import test from 'node:test'
import assert from 'node:assert/strict'
import { createWarningPlugin } from './index.js'

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

const slice = () => createWarningPlugin({ injectStyles: false }).capabilities.clipboard.slice
function context(leftover, untouched = '') {
  return {
    ownerDocument: ownerDocument(),
    createId: prefix => prefix + '-1',
    field(key) {
      if (key === 'title') return {
        before: leftover, selected: 'Author', after: '', whole: false,
      }
      if (key === 'message' && untouched) return {
        before: untouched, selected: '', after: '', whole: false,
      }
      return null
    },
  }
}

test('warning Cut removes a visually empty HTML residual block', () => {
  const original = { title: '<b>Author</b>', message: '' }
  for (const html of ['<strong></strong>', '<br>', '&nbsp;']) {
    const result = slice()(original, context(html))
    assert.equal(result.parts.length, 1)
    assert.equal(result.parts[0].kind, 'local-block')
    assert.equal(result.remaining, null,
      'warning retained a block containing only invisible HTML: ' + html)
  }
})

test('warning Cut keeps visible residual text and untouched secondary content', () => {
  const original = { title: '<b>Author</b>', message: 'Secondary' }
  const visible = slice()(original, context('<b>Visible</b>'))
  assert.deepEqual(visible.remaining, { title: '<b>Visible</b>', message: 'Secondary' })
  const titleBlank = slice()(original, context('<b></b>'))
  assert.deepEqual(titleBlank.remaining, { title: '<b></b>', message: 'Secondary' })
})
