import test from 'node:test'
import assert from 'node:assert/strict'

import { listDataSchema } from './list.js'
import { checklistDataSchema } from './checklist.js'
import { columnsDataSchema } from './columns.js'
import { tableDataSchema } from './table.js'

test('list v1 migrates positional strings to stable item identities', () => {
  const source = { style: 'unordered', items: ['A', 'B'] }
  const decoded = listDataSchema.decode({ dataVersion: 1, data: source })
  assert.deepEqual(source, { style: 'unordered', items: ['A', 'B'] })
  assert.deepEqual(decoded, {
    dataVersion: 2,
    data: {
      style: 'unordered',
      items: [
        { id: 'legacy-item-0', text: 'A' },
        { id: 'legacy-item-1', text: 'B' },
      ],
    },
  })
  const seen = []
  listDataSchema.mapRichText(decoded.data, (html, key) => {
    seen.push([key, html])
    return html
  })
  assert.deepEqual(seen, [
    ['item:legacy-item-0', 'A'],
    ['item:legacy-item-1', 'B'],
  ])
})

test('checklist migration keeps checked state and stable item keys', () => {
  const decoded = checklistDataSchema.decode({
    dataVersion: 1,
    data: { items: [{ text: 'A', checked: true }, { text: '', checked: false }] },
  })
  assert.deepEqual(decoded.data.items, [
    { id: 'legacy-item-0', text: 'A', checked: true },
    { id: 'legacy-item-1', text: '', checked: false },
  ])
})

test('columns migration creates deterministic block-local column identities', () => {
  const decoded = columnsDataSchema.decode({
    dataVersion: 1,
    data: { layout: '1-1', columns: [{ content: 'A' }, { content: 'B' }] },
  })
  assert.deepEqual(decoded.data, {
    layout: '1-1',
    columns: [
      { id: 'legacy-column-0', content: 'A' },
      { id: 'legacy-column-1', content: 'B' },
    ],
  })
  const seen = []
  columnsDataSchema.mapRichText(decoded.data, (html, key) => {
    seen.push([key, html])
    return html
  })
  assert.deepEqual(seen, [
    ['column:legacy-column-0', 'A'],
    ['column:legacy-column-1', 'B'],
  ])
})

test('table migration creates stable row and cell identities', () => {
  const decoded = tableDataSchema.decode({
    dataVersion: 1,
    data: {
      withHeadings: true,
      content: [['A', 'B'], ['C', 'D']],
    },
  })
  assert.deepEqual(decoded.data, {
    withHeadings: true,
    rows: [
      {
        id: 'legacy-row-0',
        cells: [
          { id: 'legacy-cell-0-0', text: 'A' },
          { id: 'legacy-cell-0-1', text: 'B' },
        ],
      },
      {
        id: 'legacy-row-1',
        cells: [
          { id: 'legacy-cell-1-0', text: 'C' },
          { id: 'legacy-cell-1-1', text: 'D' },
        ],
      },
    ],
  })
  const seen = []
  tableDataSchema.mapRichText(decoded.data, (html, key) => {
    seen.push([key, html])
    return html
  })
  assert.deepEqual(seen, [
    ['cell:legacy-row-0:legacy-cell-0-0', 'A'],
    ['cell:legacy-row-0:legacy-cell-0-1', 'B'],
    ['cell:legacy-row-1:legacy-cell-1-0', 'C'],
    ['cell:legacy-row-1:legacy-cell-1-1', 'D'],
  ])
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
