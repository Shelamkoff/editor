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
