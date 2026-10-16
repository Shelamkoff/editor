import test from 'node:test'
import assert from 'node:assert/strict'
import { isRichTextEmpty } from './richTextEmpty.js'

test('plain non-markup text is classified without any document dependency', () => {
  assert.equal(isRichTextEmpty(''), true)
  assert.equal(isRichTextEmpty('  \u00a0  '), true)
  assert.equal(isRichTextEmpty('hello'), false)
  assert.equal(isRichTextEmpty(' {{mention-1}} '), false)
})

test('HTML emptiness delegates to the owning template parser and preserves widget references', () => {
  const htmlToText = new Map([
    ['<br>', ''], ['<b></b>', ''], ['&nbsp;', '\u00a0'],
    ['<b>&nbsp;</b>', '\u00a0'], ['<b>hello</b>', 'hello'],
    ['<span>{{mention-1}}</span>', '{{mention-1}}'],
  ])
  const observed = []
  const ownerDocument = {
    createElement(tag) {
      assert.equal(tag, 'template')
      const template = { content: { textContent: '' } }
      Object.defineProperty(template, 'innerHTML', {
        set(html) {
          observed.push(html)
          assert.equal(htmlToText.has(html), true, 'fixture covers the expected browser text')
          template.content.textContent = htmlToText.get(html)
        },
      })
      return template
    },
  }
  for (const [html, expected] of htmlToText) {
    assert.equal(isRichTextEmpty(html, { ownerDocument }), expected.trim().length === 0, html)
  }
  assert.equal(observed.length, htmlToText.size)
})

test('the markup path fails explicitly without a working owner-document parser', () => {
  assert.throws(() => isRichTextEmpty('<b></b>', { ownerDocument: {} }), /owning document/)
})
