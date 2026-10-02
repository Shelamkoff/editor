import test from 'node:test'
import assert from 'node:assert/strict'

import { delimiterDataSchema } from './delimiter.js'
import { quoteDataSchema } from './quote.js'
import { warningDataSchema } from './warning.js'
import { rawDataSchema } from './raw.js'
import { toggleDataSchema } from './toggle.js'
import { spoilerDataSchema } from './spoiler.js'

const schemas = [
  ['delimiter', delimiterDataSchema],
  ['quote', quoteDataSchema],
  ['warning', warningDataSchema],
  ['raw', rawDataSchema],
  ['toggle', toggleDataSchema],
  ['spoiler', spoilerDataSchema],
]

test('simple v2 block schemas expose editor-valid canonical defaults', () => {
  for (const [name, schema] of schemas) {
    const value = schema.createDefault()
    assert.deepEqual(schema.encode(value).data, value, name)
  }
})

test('quote rich-text fields use stable logical keys', () => {
  const seen = []
  const mapped = quoteDataSchema.mapRichText(
    { text: 'A', caption: 'B' },
    (html, key) => {
      seen.push([key, html])
      return html
    },
  )
  assert.deepEqual(seen, [['text', 'A'], ['caption', 'B']])
  assert.deepEqual(mapped, { text: 'A', caption: 'B' })
})

test('warning rich-text fields use stable logical keys', () => {
  const seen = []
  warningDataSchema.mapRichText(
    { title: 'A', message: 'B' },
    (html, key) => {
      seen.push([key, html])
      return html
    },
  )
  assert.deepEqual(seen, [['title', 'A'], ['message', 'B']])
})

test('toggle and spoiler rich-text fields keep distinct keys', () => {
  const toggle = []
  toggleDataSchema.mapRichText(
    { title: 'A', content: 'B', open: false },
    (html, key) => {
      toggle.push([key, html])
      return html
    },
  )
  assert.deepEqual(toggle, [['title', 'A'], ['content', 'B']])

  const spoiler = []
  spoilerDataSchema.mapRichText(
    { label: 'A', content: 'B' },
    (html, key) => {
      spoiler.push([key, html])
      return html
    },
  )
  assert.deepEqual(spoiler, [['label', 'A'], ['content', 'B']])
})

test('raw data is not declared as rich text', () => {
  assert.equal(rawDataSchema.mapRichText({ html: '<script>x</script>' }, html => html).html, '<script>x</script>')
})
