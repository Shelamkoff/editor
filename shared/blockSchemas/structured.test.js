import test from 'node:test'
import assert from 'node:assert/strict'

import { listDataSchema } from './list.js'
import { checklistDataSchema } from './checklist.js'
import { columnsDataSchema } from './columns.js'
import { tableDataSchema } from './table.js'

test('structured schemas reject missing, old, and legacy-shaped serialized data', () => {
  assert.throws(
    () => listDataSchema.decode({ dataVersion: 1, data: { style: 'unordered', items: ['A', 'B'] } }),
    /Unsupported data version 1/,
  )
  assert.throws(
    () => listDataSchema.decode({ data: { style: 'unordered', items: [{ id: 'a', text: 'A' }] } }),
    /dataVersion is required/,
  )
  assert.throws(
    () => checklistDataSchema.decode({
      dataVersion: 2,
      data: { items: [{ text: 'A', checked: true }] },
    }),
    /id must be a non-empty string/,
  )
  assert.throws(
    () => columnsDataSchema.decode({
      dataVersion: 2,
      data: { layout: '1-1', columns: [{ content: 'A' }, { content: 'B' }] },
    }),
    /Column id must be a non-empty string/,
  )
  assert.throws(
    () => tableDataSchema.decode({
      dataVersion: 2,
      data: { withHeadings: true, content: [['A', 'B']] },
    }),
    /rows must be a non-empty array/,
  )
})

test('structured schemas reject duplicate stable identities', () => {
  assert.throws(() => listDataSchema.encode({
    style: 'ordered',
    items: [{ id: 'x', text: 'A' }, { id: 'x', text: 'B' }],
  }), /Duplicate List item id/)

  assert.throws(() => columnsDataSchema.encode({
    layout: '1-1',
    columns: [{ id: 'x', content: '' }, { id: 'x', content: '' }],
  }), /Duplicate column id/)

  assert.throws(() => tableDataSchema.encode({
    withHeadings: false,
    rows: [
      { id: 'r', cells: [{ id: 'c', text: '' }] },
      { id: 'r', cells: [{ id: 'c2', text: '' }] },
    ],
  }), /Duplicate table row id/)
})

test('structured defaults are editor-valid and carry stable subfield ids', () => {
  for (const schema of [listDataSchema, checklistDataSchema, columnsDataSchema, tableDataSchema]) {
    const value = schema.createDefault()
    assert.deepEqual(schema.encode(value).data, value)
  }
})
