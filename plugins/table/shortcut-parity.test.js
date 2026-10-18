import test from 'node:test'
import assert from 'node:assert/strict'
import { createTablePlugin } from './index.js'

const shortcuts = createTablePlugin({ injectStyles: false }).capabilities.shortcuts
const data = {
  withHeadings: true,
  rows: [
    { id: 'r:0', cells: [
      { id: 'c%0', text: '<b>Alpha</b>' },
      { id: 'second', text: 'Bravo' },
    ] },
    { id: 'r:1', cells: [
      { id: 'c%0', text: 'Charlie' },
      { id: 'second', text: 'Delta' },
    ] },
  ],
}
const input = (key, fieldKey, extra = {}) => ({
  key, fieldKey, shiftKey: false, ctrlKey: false, metaKey: false,
  altKey: false, selection: { start: 2, end: 3 }, fieldLength: 5,
  ...extra,
})

test('Table Enter splits only the addressed rich-text cell and leaves other cells unchanged', () => {
  let reads = 0
  const result = shortcuts.handle(input('Enter', 'cell:r%3A0:c%250'), data, {
    splitField(key, range) {
      reads++
      assert.equal(key, 'cell:r%3A0:c%250')
      assert.deepEqual(range, { start: 2, end: 3 })
      return { before: '<b>Al</b>', after: '<b>ha</b>' }
    },
  })
  assert.equal(reads, 1)
  assert.equal(result.kind, 'update')
  assert.equal(result.focus.fieldKey, 'cell:r%3A0:c%250')
  assert.equal(result.focus.offset, 3)
  assert.deepEqual(result.data.rows.map(row => row.cells.map(cell => cell.text)), [
    ['<b>Al</b><br><b>ha</b>', 'Bravo'],
    ['Charlie', 'Delta'],
  ])
  assert.deepEqual(data.rows[0].cells.map(c => c.text), ['<b>Alpha</b>', 'Bravo'],
    'Table shortcut mutated its source data')
})

test('Table Tab traverses the selected 2×2 grid in row-major order, including escaped identities', () => {
  assert.deepEqual(shortcuts.handle(input('Tab', 'cell:r%3A0:c%250'), data, {}),
    { kind: 'focus', target: { fieldKey: 'cell:r%3A0:second', offset: 'start' } })
  assert.deepEqual(shortcuts.handle(input('Tab', 'cell:r%3A1:c%250', { shiftKey: true }), data, {}),
    { kind: 'focus', target: { fieldKey: 'cell:r%3A0:second', offset: 'end' } })
  assert.equal(shortcuts.handle(input('Tab', 'cell:r%3A1:second'), data, {}), null)
  assert.equal(shortcuts.handle(input('Tab', 'cell:r%3A0:c%250', { shiftKey: true }), data, {}), null)
})

test('Table Enter with a stale or unregistered field gracefully declines the shortcut', () => {
  const result = shortcuts.handle(input('Enter', 'cell:removed:unknown'), data, {
    splitField() { return null },
  })
  assert.equal(result, null, 'Table dereferenced a missing rich-text slice')
  assert.deepEqual(data.rows[0].cells.map(c => c.text), ['<b>Alpha</b>', 'Bravo'])
})
