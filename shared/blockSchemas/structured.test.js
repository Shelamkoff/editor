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

test('a new Table defaults to the documented v1 three-by-three grid with independent identified cells', () => {
  const first = tableDataSchema.createDefault()
  const second = tableDataSchema.createDefault()
  const emptyGrid = [['', '', ''], ['', '', ''], ['', '', '']]
  assert.equal(first.withHeadings, false)
  assert.deepEqual(first.rows.map(row => row.cells.map(cell => cell.text)), emptyGrid)
  assert.equal(new Set(first.rows.map(row => row.id)).size, 3)
  for (const row of first.rows) {
    assert.equal(typeof row.id, 'string')
    assert.ok(row.id.length > 0)
    assert.equal(new Set(row.cells.map(cell => cell.id)).size, 3)
    assert.ok(row.cells.every(cell => typeof cell.id === 'string' && cell.id.length > 0))
  }
  assert.equal(new Set(first.rows.map(row => row.cells)).size, 3)
  assert.equal(new Set(first.rows.flatMap(row => row.cells)).size, 9)
  assert.deepEqual(tableDataSchema.decode(tableDataSchema.encode(first)).data, first)

  first.rows[0].cells[0].text = 'Caller mutation'
  first.rows[1].cells.pop()
  assert.deepEqual(second.rows.map(row => row.cells.map(cell => cell.text)), emptyGrid)
  assert.deepEqual(tableDataSchema.createDefault(), second)
})

for (const [name, data] of [
  ['one-by-one', { withHeadings: true, rows: [{ id: 'single-row', cells: [{ id: 'single-cell', text: 'Only cell' }] }] }],
  ['three-by-three', { withHeadings: false, rows: [
    { id: 'first', cells: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] },
    { id: 'middle', cells: [{ id: 'a', text: 'D' }, { id: 'b', text: 'E' }, { id: 'c', text: 'F' }] },
    { id: 'last', cells: [{ id: 'a', text: 'G' }, { id: 'b', text: 'H' }, { id: 'c', text: 'I' }] },
  ] }],
]) {
  test(`explicit ${name} Table data keeps its dimensions, identities and values`, () => {
    const input = structuredClone(data)
    const encoded = tableDataSchema.encode(input)
    assert.equal(encoded.dataVersion, 2)
    assert.deepEqual(encoded.data, data)
    assert.deepEqual(tableDataSchema.decode(encoded).data, data)
    assert.deepEqual(input, data)
    encoded.data.rows[0].cells[0].text = 'Returned value mutation'
    assert.deepEqual(input, data)
  })
}
