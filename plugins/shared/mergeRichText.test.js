import test from 'node:test'
import assert from 'node:assert/strict'
import { createQuotePlugin } from '../quote/index.js'
import { createWarningPlugin } from '../warning/index.js'
import { createTogglePlugin } from '../toggle/index.js'
import { createSpoilerPlugin } from '../spoiler/index.js'

const meanings = new Map([['<b></b>', ''], ['<i></i>', ''], ['<br>', ''], ['&nbsp;', '\u00a0'], ['<b>First</b>', 'First'], ['<b>Next</b>', 'Next'], ['<i>Keep</i> {{a}}', 'Keep {{a}}'], ['<i>Body</i> {{b}}', 'Body {{b}}']])
for (const [type, factory, first, last] of [['quote', createQuotePlugin, 'text', 'caption'], ['warning', createWarningPlugin, 'title', 'message'], ['toggle', createTogglePlugin, 'title', 'content'], ['spoiler', createSpoilerPlugin, 'label', 'content']]) {
  test(`${type} merge skips semantically empty line-separated fields in the owning realm`, () => {
    const parsed = []
    const ownerDocument = { createElement(tag) {
      assert.equal(tag, 'template')
      const template = { content: { textContent: '' } }
      Object.defineProperty(template, 'innerHTML', { set(value) { assert.ok(meanings.has(value), value); parsed.push(value); template.content.textContent = meanings.get(value) } })
      return template
    } }
    const merge = factory({ injectStyles: false }).capabilities.merge.merge, context = Object.freeze({ ownerDocument })
    for (const empty of ['', '<b></b>', '<i></i>', '<br>', '&nbsp;']) for (const field of [first, last]) for (const side of ['source', 'target']) {
      const target = { [first]: '<b>First</b>', [last]: '<i>Keep</i> {{a}}', ...(type === 'toggle' ? { open: false } : {}) }
      const source = { [first]: '<b>Next</b>', [last]: '<i>Body</i> {{b}}', ...(type === 'toggle' ? { open: true } : {}) }
      ;(side === 'source' ? source : target)[field] = empty
      const expected = { [first]: type === 'quote' ? target[first] + source[first] : field === first ? (side === 'source' ? target[first] : source[first]) : '<b>First</b><br><b>Next</b>', [last]: field === last ? (side === 'source' ? target[last] : source[last]) : '<i>Keep</i> {{a}}<br><i>Body</i> {{b}}', ...(type === 'toggle' ? { open: true } : {}) }
      assert.deepEqual(merge(Object.freeze(target), Object.freeze(source), context), expected)
    }
    assert.ok(parsed.includes('<br>') && parsed.includes('&nbsp;') && parsed.includes('<i>Body</i> {{b}}'))
    if (type === 'toggle') assert.equal(merge({ title: 'A', content: '', open: false }, { title: 'B', content: '', open: false }, context).open, false)
  })
}
