import test from 'node:test'
import assert from 'node:assert/strict'
import { createColumnsPlugin } from './index.js'

const capabilities = createColumnsPlugin({ injectStyles: false }).capabilities
const source = () => ({
  layout: '1-1-1',
  columns: [
    { id: 'first', content: '<b>Alpha</b>' },
    { id: 'second', content: 'Bravo' },
    { id: 'third', content: '<i>Charlie</i>' },
  ],
})

test('Columns reduction merges overflow content without losing ordered markup or source identities', () => {
  const original = source()
  const reduced = capabilities.settings.apply(original, '1-1', {
    createId() { throw new Error('shrink cannot require an ID') },
  })
  assert.deepEqual(reduced, {
    layout: '1-1',
    columns: [
      { id: 'first', content: '<b>Alpha</b>' },
      { id: 'second', content: 'Bravo<br><i>Charlie</i>' },
    ],
  })
  assert.deepEqual(original, source(), 'layout reduction mutated the canonical predecessor')
})

test('Columns growing and narrowing restores legal column count while preserving the surviving IDs', () => {
  let created = 0
  const add = { createId: prefix => prefix + '-new-' + (++created) }
  const original = { layout: '1-1', columns: [
    { id: 'first', content: 'Alpha' },
    { id: 'second', content: 'Bravo' },
  ] }
  const grown = capabilities.settings.apply(original, '1-1-1', add)
  assert.equal(created, 1)
  assert.deepEqual(grown.columns, [
    original.columns[0], original.columns[1], { id: 'column-new-1', content: '' },
  ])
  const narrowed = capabilities.settings.apply(grown, '2-1', add)
  assert.deepEqual(narrowed.columns, original.columns)
  assert.equal(created, 1)
})

test('Columns Cut carries layout and selected fields but never leaks text from an unselected column', () => {
  const original = source()
  const field = key => key === 'column:second'
    ? { before: 'B', selected: 'ra', after: 'vo', whole: false }
    : null
  const result = capabilities.clipboard.slice(original, { field })
  assert.equal(result.parts[0].kind, 'local-block')
  assert.deepEqual(result.parts[0].data, {
    layout: '1-1-1',
    columns: [
      { id: 'first', content: '' },
      { id: 'second', content: 'ra' },
      { id: 'third', content: '' },
    ],
  })
  assert.deepEqual(result.remaining, {
    layout: '1-1-1',
    columns: [
      { id: 'first', content: '<b>Alpha</b>' },
      { id: 'second', content: 'Bvo' },
      { id: 'third', content: '<i>Charlie</i>' },
    ],
  })
  assert.deepEqual(original, source())
})
