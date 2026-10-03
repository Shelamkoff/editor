import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mapColumnsTextFields,
  mapListTextFields,
  mapSpoilerTextFields,
  mapTableTextFields,
  mapToggleTextFields,
  mapWarningTextFields,
} from './mapTextFields.js'

const mark = (html) => `[${html}]`

test('list mapper transforms v2 item text while preserving stable ids', () => {
  const data = { items: [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }, 'invalid-item'] }

  mapListTextFields(data, mark)

  assert.deepEqual(data.items, [
    { id: 'a', text: '[one]' },
    { id: 'b', text: '[two]' },
    'invalid-item',
  ])
})

test('table mapper transforms v2 cell text while preserving row and cell ids', () => {
  const data = {
    rows: [
      { id: 'r1', cells: [{ id: 'c1', text: 'a' }, { id: 'c2', text: 'b' }] },
      { id: 'r2', cells: [{ id: 'c3', text: 'c' }] },
      'invalid-row',
    ],
  }

  mapTableTextFields(data, mark)

  assert.deepEqual(data.rows, [
    { id: 'r1', cells: [{ id: 'c1', text: '[a]' }, { id: 'c2', text: '[b]' }] },
    { id: 'r2', cells: [{ id: 'c3', text: '[c]' }] },
    'invalid-row',
  ])
})

test('columns mapper transforms every rich-text column without reshaping invalid entries', () => {
  const data = { columns: [{ content: 'a' }, { content: 'b' }, 'invalid-column'] }

  mapColumnsTextFields(data, mark)

  assert.deepEqual(data.columns, [{ content: '[a]' }, { content: '[b]' }, 'invalid-column'])
})

test('warning mapper transforms both rich-text fields', () => {
  const data = { title: 'Title', message: 'Message' }

  mapWarningTextFields(data, mark)

  assert.deepEqual(data, { title: '[Title]', message: '[Message]' })
})

test('toggle mapper transforms its title and body', () => {
  const data = { title: 'Title', content: 'Body' }

  mapToggleTextFields(data, mark)

  assert.deepEqual(data, { title: '[Title]', content: '[Body]' })
})

test('spoiler mapper transforms its label and concealed content', () => {
  const data = { label: 'Label', content: 'Secret' }

  mapSpoilerTextFields(data, mark)

  assert.deepEqual(data, { label: '[Label]', content: '[Secret]' })
})
