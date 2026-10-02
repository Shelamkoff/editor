import test from 'node:test'
import assert from 'node:assert/strict'

import { createDelimiterPlugin } from './delimiter/v2.js'
import { createRawPlugin } from './raw/v2.js'
import { createQuotePlugin } from './quote/v2.js'
import { createWarningPlugin } from './warning/v2.js'
import { createTogglePlugin } from './toggle/v2.js'
import { createSpoilerPlugin } from './spoiler/v2.js'

const definitions = [
  createDelimiterPlugin(),
  createRawPlugin(),
  createQuotePlugin(),
  createWarningPlugin(),
  createTogglePlugin(),
  createSpoilerPlugin(),
]

test('simple v2 block definitions are immutable and schema-owned', () => {
  for (const definition of definitions) {
    assert.ok(Object.isFrozen(definition), definition.type)
    assert.ok(definition.schema, definition.type)
    assert.equal(typeof definition.schema.createDefault, 'function', definition.type)
    const initial = definition.schema.createDefault()
    assert.deepEqual(definition.schema.encode(initial).data, initial, definition.type)
  }
})

test('simple v2 block emptiness is data-driven', () => {
  const byType = new Map(definitions.map(definition => [definition.type, definition]))
  assert.equal(byType.get('delimiter').capabilities.empty.isEmpty({}), false)
  assert.equal(byType.get('raw').capabilities.empty.isEmpty({ html: '' }), true)
  assert.equal(byType.get('quote').capabilities.empty.isEmpty({ text: '', caption: '' }), true)
  assert.equal(byType.get('warning').capabilities.empty.isEmpty({ title: '', message: '' }), true)
  assert.equal(byType.get('toggle').capabilities.empty.isEmpty({ title: '', content: '', open: false }), true)
  assert.equal(byType.get('spoiler').capabilities.empty.isEmpty({ label: '', content: '' }), true)
})

test('simple rich-text definitions declare formatting and neutral conversion explicitly', () => {
  for (const type of ['quote', 'warning', 'toggle', 'spoiler']) {
    const definition = definitions.find(item => item.type === type)
    assert.equal(definition.capabilities.formatting.inlineTools, true, type)
    const payload = definition.capabilities.conversion.export(definition.schema.createDefault())
    assert.equal(payload.kind, 'rich-text', type)
    assert.equal(definition.capabilities.conversion.canImport(payload), true, type)
  }
})
