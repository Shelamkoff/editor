import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeKnownBlockData } from './blockDataNormalizers.js'

for (const layout of ['missing', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
  test(`invalid Columns layout ${layout} retains the two fallback columns`, () => {
    const input = { layout, columns: [{ content: 'Left' }, { content: 'Right' }] }
    const before = structuredClone(input)
    assert.deepEqual(normalizeKnownBlockData('columns', input), {
      layout: '1-1', columns: [{ content: 'Left' }, { content: 'Right' }],
    })
    assert.deepEqual(input, before)
  })
}
test('a supported Columns layout retains its documented column count', () => {
  assert.deepEqual(normalizeKnownBlockData('columns', {
    layout: '1-1-1', columns: [{ content: 'A' }, { content: 'B' }, { content: 'C' }],
  }), { layout: '1-1-1', columns: [{ content: 'A' }, { content: 'B' }, { content: 'C' }] })
})

for (const [layout, expectedLayout, expected] of [
  ['1-1', '1-1', ['A', 'B<br>C<br>D']],
  ['1-2', '1-2', ['A', 'B<br>C<br>D']],
  ['2-1', '2-1', ['A', 'B<br>C<br>D']],
  ['1-1-1', '1-1-1', ['A', 'B', 'C<br>D']],
  ['invalid', '1-1', ['A', 'B<br>C<br>D']],
]) {
  test(`preserve normalization retains overflow text for Columns layout ${layout}`, () => {
    const input = { layout, columns: ['A', 'B', 'C', 'D'].map(content => ({ content })) }
    const before = structuredClone(input)
    const result = normalizeKnownBlockData('columns', input)
    assert.deepEqual(result, { layout: expectedLayout, columns: expected.map(content => ({ content })) })
    assert.deepEqual(normalizeKnownBlockData('columns', result), result)
    assert.deepEqual(input, before)
  })
}

test('Columns overflow joins only non-blank content without dropping formatting or placeholders', () => {
  assert.deepEqual(normalizeKnownBlockData('columns', {
    layout: '1-1', columns: ['A', '', '  ', '<b>Keep</b>', '{{w}}', ''].map(content => ({ content })),
  }), { layout: '1-1', columns: [{ content: 'A' }, { content: '<b>Keep</b><br>{{w}}' }] })
})
