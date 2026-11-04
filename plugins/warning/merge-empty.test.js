import test from 'node:test'
import assert from 'node:assert/strict'
import { createWarningPlugin } from './index.js'

test('Warning merge ignores empty HTML on either side and preserves widget references', () => {
  const text = new Map([['<b></b>', ''], ['<i></i>', ''], ['<br>', ''], ['&nbsp;', '\u00a0'], ['<b>First</b>', 'First'], ['<i>Next</i>', 'Next'], ['<b>{{swatch}}</b>', '{{swatch}}']])
  const parsed = []
  const ownerDocument = {
    createElement(tag) {
      assert.equal(tag, 'template')
      const template = { content: { textContent: '' } }
      Object.defineProperty(template, 'innerHTML', { set(value) {
        assert.ok(text.has(value), value)
        parsed.push(value)
        template.content.textContent = text.get(value)
      } })
      return template
    },
  }
  const merge = createWarningPlugin({ injectStyles: false }).capabilities.merge.merge
  const context = Object.freeze({ ownerDocument })
  for (const empty of ['', '<b></b>', '<i></i>', '<br>', '&nbsp;']) {
    const full = { title: '<b>First</b>', message: '<b>{{swatch}}</b>' }
    const blank = { title: empty, message: empty }
    assert.deepEqual(merge(full, blank, context), full)
    assert.deepEqual(merge(blank, full, context), full)
  }
  assert.deepEqual(merge({ title: '<b>First</b>', message: '{{left}}' }, { title: '<i>Next</i>', message: '{{right}}' }, context), { title: '<b>First</b><br><i>Next</i>', message: '{{left}}<br>{{right}}' })
  assert.ok(parsed.includes('<b></b>') && parsed.includes('<b>{{swatch}}</b>'))
})
