import test from 'node:test'
import assert from 'node:assert/strict'
import { createTablePlugin } from './index.js'

const capability = createTablePlugin({ injectStyles: false }).capabilities.clipboard
const matrix = (rows, withHeadings = true) => ({
  withHeadings,
  rows: rows.map((values, row) => ({
    id: 'row-' + row,
    cells: values.map((text, col) => ({ id: 'cell-' + col, text })),
  })),
})
const tableKey = (row, col) => 'cell:row-' + row + ':cell-' + col
function context(values) {
  const selected = new Map(values)
  return { field(key) { return selected.get(key) ?? null } }
}
const full = text => ({ selected: text, before: '', after: '', whole: true })

test('Table selection spanning disjoint columns exports the minimal rectangle and leaves unselected source cells intact', () => {
  const data = matrix([
    ['A0', 'A1', 'A2'],
    ['B0', 'B1', 'B2'],
    ['C0', 'C1', 'C2'],
  ])
  const sliced = capability.slice(data, context([
    [tableKey(0, 1), { before: 'A', selected: '1', after: '', whole: false }],
    [tableKey(0, 2), full('A2')],
    [tableKey(1, 0), full('B0')],
    [tableKey(1, 1), full('B1')],
    [tableKey(1, 2), full('B2')],
    [tableKey(2, 0), { before: '', selected: 'C', after: '0', whole: false }],
  ]))
  assert.equal(sliced.parts.length, 1)
  assert.equal(sliced.parts[0].kind, 'local-block')
  assert.deepEqual(
    sliced.parts[0].data.rows.map(row => row.cells.map(cell => cell.text)),
    [['', '1', 'A2'], ['B0', 'B1', 'B2'], ['C', '', '']],
    'selected rectangle leaked text from cells outside the authored range',
  )
  assert.equal(sliced.parts[0].data.withHeadings, true)
  assert.deepEqual(sliced.remaining.rows.map(row => row.cells.map(cell => cell.text)), [
    ['A0', 'A', ''],
    ['', '', ''],
    ['0', 'C1', 'C2'],
  ])
  assert.deepEqual(data.rows.map(row => row.cells.map(cell => cell.text)), [
    ['A0', 'A1', 'A2'], ['B0', 'B1', 'B2'], ['C0', 'C1', 'C2'],
  ], 'clipboard capability mutated source data')
})

test('Table selection starting below header does not make the copied first row a heading', () => {
  const data = matrix([['Header', 'H2'], ['Alpha', 'Beta'], ['Gamma', 'Delta']])
  const slice = capability.slice(data, context([
    [tableKey(1, 0), full('Alpha')],
    [tableKey(1, 1), full('Beta')],
  ]))
  assert.equal(slice.parts[0].data.withHeadings, false)
  assert.deepEqual(slice.parts[0].data.rows.map(row => row.id), ['row-1'])
  assert.deepEqual(slice.parts[0].data.rows[0].cells.map(c => c.text), ['Alpha', 'Beta'])
  assert.equal(slice.remaining.withHeadings, true)
  assert.deepEqual(slice.remaining.rows[0], data.rows[0])
})

test('Table settings append columns and rows with unique stable identities and preserve preexisting cells', () => {
  const data = matrix([['Name', 'Value'], ['A', '1']])
  const settings = createTablePlugin({ injectStyles: false }).capabilities.settings
  let serial = 0
  const ctx = { createId: prefix => prefix + '-new-' + ++serial }
  const added = settings.apply(data, 'col-add', ctx)
  assert.deepEqual(added.rows.map(row => row.cells.map(cell => cell.text)), [
    ['Name', 'Value', ''], ['A', '1', ''],
  ])
  assert.equal(added.rows[0].cells[0].id, 'cell-0')
  assert.equal(added.rows[1].cells[1].id, 'cell-1')
  const expanded = settings.apply(added, 'row-add', ctx)
  assert.equal(expanded.rows.length, 3)
  assert.equal(expanded.rows[2].cells.length, 3)
  assert.deepEqual(expanded.rows[2].cells.map(cell => cell.text), ['', '', ''])
  assert.equal(new Set(expanded.rows.map(row => row.id)).size, expanded.rows.length)
  assert.deepEqual(data.rows.map(row => row.cells.map(cell => cell.text)), [['Name', 'Value'], ['A', '1']])
})
