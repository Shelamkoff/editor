import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mapColumnsTextFields,
  mapSpoilerTextFields,
  mapTableTextFields,
  mapToggleTextFields,
  mapWarningTextFields,
} from './mapTextFields.js'

const mark = (html) => `[${html}]`

test('table mapper transforms every string cell without reshaping invalid entries', () => {
  const data = { content: [['a', 'b'], ['c'], 'invalid-row'] }

  mapTableTextFields(data, mark)

  assert.deepEqual(data.content, [['[a]', '[b]'], ['[c]'], 'invalid-row'])
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
