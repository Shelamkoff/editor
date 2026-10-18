import test from 'node:test'
import assert from 'node:assert/strict'
import { columnsDataSchema } from '../../shared/blockSchemas/columns.js'

const valid = () => ({
  layout: '1-1',
  columns: [
    { id: 'first', content: '<b>Alpha</b>' },
    { id: 'second', content: 'Bravo' },
  ],
})

test('Columns current schema persists stable column identities and rich-text in exact version', () => {
  const original = valid()
  const encoded = columnsDataSchema.encode(original)
  assert.equal(encoded.dataVersion, columnsDataSchema.currentVersion)
  assert.deepEqual(columnsDataSchema.decode(encoded), encoded)
  assert.deepEqual(original, valid(), 'encode() modified caller-owned model')
})

test('Columns strict v2 schema rejects obsolete or ambiguous layout payloads instead of silently dropping content', () => {
  for (const wrong of [
    { layout: '1-1', columns: [{ content: 'A' }, { content: 'B' }] },
    { layout: 'unknown', columns: valid().columns },
    { layout: '1-1', columns: [...valid().columns, { id: 'extra', content: 'Must survive' }] },
    { layout: '1-1-1', columns: valid().columns },
    { layout: '1-1', columns: [{ id: 'first', content: 'A' }, { id: 'first', content: 'B' }] },
  ]) {
    assert.throws(() => columnsDataSchema.encode(wrong),
      /Columns layout is invalid|Columns count must match layout|Column id must|Duplicate column id/,
      'obsolete or malformed payload was silently normalized: ' + JSON.stringify(wrong))
  }
})

test('Columns default is an independent legal two-column value with stable IDs', () => {
  const first = columnsDataSchema.createDefault()
  const second = columnsDataSchema.createDefault()
  assert.deepEqual(first, {
    layout: '1-1',
    columns: [
      { id: 'column-0', content: '' },
      { id: 'column-1', content: '' },
    ],
  })
  first.columns[0].content = 'Mutated locally'
  assert.equal(second.columns[0].content, '')
})
