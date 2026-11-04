import test from 'node:test'
import assert from 'node:assert/strict'
import { createColumnsPlugin } from '../columns/index.js'

test('Columns reduction joins visible fields in the supplied owning document without empty separators', () => {
  const meanings = new Map([['<b></b>', ''], ['<i></i>', ''], ['<br>', ''], ['&nbsp;', '\u00a0'], ['<i>Body</i> {{b}}', 'Body {{b}}'], ['<s>Tail</s> {{c}}', 'Tail {{c}}']])
  const parsed = []
  const ownerDocument = { createElement(tag) {
    assert.equal(tag, 'template')
    const template = { content: { textContent: '' } }
    Object.defineProperty(template, 'innerHTML', { set(value) { assert.ok(meanings.has(value), value); parsed.push(value); template.content.textContent = meanings.get(value) } })
    return template
  } }
  const apply = createColumnsPlugin().capabilities.settings.apply
  for (const empty of ['', '<b></b>', '<i></i>', '<br>', '&nbsp;']) for (const side of ['source', 'target']) {
    const target = side === 'target' ? empty : '<i>Body</i> {{b}}'
    const source = side === 'source' ? empty : '<s>Tail</s> {{c}}'
    const columns = [{ id: 'a', content: 'Keep {{a}}' }, { id: 'b', content: target }, { id: 'c', content: source }].map(Object.freeze)
    const data = Object.freeze({ layout: '1-1-1', columns: Object.freeze(columns) })
    const result = apply(data, '1-1', { ownerDocument, createId() { throw new Error('Reduction must retain surviving identities') } })
    assert.deepEqual(result, { layout: '1-1', columns: [{ id: 'a', content: 'Keep {{a}}' }, { id: 'b', content: side === 'source' ? target : source }] })
    assert.equal(data.columns.length, 3)
    assert.equal(data.columns[1].content, target)
    assert.equal(data.columns[2].content, source)
  }
  assert.ok(parsed.includes('<br>') && parsed.includes('&nbsp;') && parsed.includes('<s>Tail</s> {{c}}'))
})
