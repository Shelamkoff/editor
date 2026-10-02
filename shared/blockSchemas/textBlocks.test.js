import test from 'node:test'
import assert from 'node:assert/strict'

import { paragraphDataSchema } from './paragraph.js'
import { headingDataSchema } from './heading.js'

test('Paragraph v2 schema removes legacy alignment and emits current dataVersion', () => {
  assert.deepEqual(paragraphDataSchema.createDefault(), { text: '' })

  assert.deepEqual(paragraphDataSchema.decode({
    data: { text: 'Body', align: 'center' },
  }), {
    dataVersion: 2,
    data: { text: 'Body' },
  })

  assert.deepEqual(paragraphDataSchema.encode({ text: 'Body' }), {
    dataVersion: 2,
    data: { text: 'Body' },
  })
})

test('Heading v2 schema removes legacy alignment and validates levels', () => {
  assert.deepEqual(headingDataSchema.createDefault(), { text: '', level: 2 })

  assert.deepEqual(headingDataSchema.decode({
    dataVersion: 1,
    data: { text: 'Title', level: 4, align: 'right' },
  }), {
    dataVersion: 2,
    data: { text: 'Title', level: 4 },
  })

  assert.throws(
    () => headingDataSchema.encode({ text: 'Title', level: 1 }),
    /Heading level must be an integer from 2 through 6/,
  )
})

test('text block schemas reject malformed current data instead of coercing it', () => {
  assert.throws(
    () => paragraphDataSchema.encode({ text: 42 }),
    /Paragraph text must be a string/,
  )
  assert.throws(
    () => headingDataSchema.decode({ dataVersion: 2, data: { text: [], level: 2 } }),
    /Heading text must be a string/,
  )
})

test('text block schema defaults are detached values', () => {
  const first = paragraphDataSchema.createDefault()
  const second = paragraphDataSchema.createDefault()
  first.text = 'changed'
  assert.deepEqual(second, { text: '' })
})
