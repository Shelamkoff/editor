import test from 'node:test'
import assert from 'node:assert/strict'
import { createTablePlugin } from './index.js'

// The HTML importer is a pure capability. Exercise its public inputs with a
// minimal DOM-shaped input without coupling the test to browser quirks.
const cell = (tag, text) => ({ tagName: tag.toUpperCase(), textContent: text })
const row = (...cells) => ({
  children: cells,
  querySelectorAll(selector) {
    assert.equal(selector, ':scope > th, :scope > td')
    return cells.filter(item => item.tagName === 'TH' || item.tagName === 'TD')
  },
})
const table = (...rows) => ({
  tagName: 'TABLE',
  querySelectorAll(selector) {
    assert.equal(selector, 'tr')
    return rows
  },
})
function importTable(root) {
  let serial = 0
  const result = createTablePlugin({ injectStyles: false }).capabilities.htmlImport.importRoot(root, {
    createId(prefix) { return prefix + '-' + (++serial) },
    serializeRichText(element) { return element.textContent },
  })
  return result
}

test('Table HTML import uses the first populated row for header detection', () => {
  const imported = importTable(table(
    row(),
    row(cell('th', 'Name'), cell('th', 'Value')),
    row(cell('td', 'A'), cell('td', '1')),
  ))
  assert.equal(imported.withHeadings, true, 'an empty leading tr cannot erase thead semantics')
  assert.deepEqual(imported.rows.map(item => item.cells.map(c => c.text)), [
    ['Name', 'Value'], ['A', '1'],
  ])
})

test('Table HTML import does not promote a later row when first populated row is data', () => {
  const imported = importTable(table(
    row(),
    row(cell('td', 'A')),
    row(cell('th', 'B')),
  ))
  assert.equal(imported.withHeadings, false)
  assert.deepEqual(imported.rows.map(item => item.cells[0].text), ['A', 'B'])
})

test('Table HTML import retains direct first-row heading semantics', () => {
  const imported = importTable(table(row(cell('th', 'Header')), row(cell('td', 'Value'))))
  assert.equal(imported.withHeadings, true)
  assert.equal(imported.rows.length, 2)
})
