import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as pluginPreset from './index.js'
import {
  createDefaultRenderers,
  getSupportedBlockTypes,
} from '../renderer/renderers/index.js'
import { BLOCK_TYPES } from '../shared/blockTypes.js'

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

test('editable plugin definitions, output types and read-only renderers stay in sync', () => {
  const factories = Object.entries(pluginPreset)
    .filter(([name, value]) => /^create.+Plugin$/.test(name) && typeof value === 'function')

  assert.equal(factories.length, BLOCK_TYPES.length, 'the complete preset must expose every canonical block plugin')

  const definitions = factories.map(([, factory]) => factory())
  const pluginTypes = definitions.map(definition => definition.type)
  assert.equal(new Set(pluginTypes).size, pluginTypes.length, 'plugin block types must be unique')
  assert.deepEqual(sorted(pluginTypes), sorted(BLOCK_TYPES))

  for (const definition of definitions) {
    assert.equal(typeof definition.type, 'string')
    assert.ok(definition.type.length > 0)
    assert.equal(typeof definition.setup, 'function', `${definition.type} must expose setup()`)
    assert.equal(typeof definition.schema?.createDefault, 'function', `${definition.type} must expose a schema`)
    assert.ok(Number.isSafeInteger(definition.schema.currentVersion) && definition.schema.currentVersion >= 1)
    const created = definition.schema.createDefault()
    const encoded = definition.schema.encode(created)
    assert.equal(encoded.dataVersion, definition.schema.currentVersion)
    const decoded = definition.schema.decode(encoded)
    assert.equal(decoded.dataVersion, definition.schema.currentVersion)
    assert.deepEqual(decoded.data, encoded.data, `${definition.type} default schema must exact-roundtrip`)
  }

  const rendererTypes = getSupportedBlockTypes()
  assert.deepEqual(rendererTypes, BLOCK_TYPES)
  assert.deepEqual(sorted(pluginTypes), sorted(rendererTypes))

  const renderers = createDefaultRenderers('contract', {})
  assert.equal(renderers.size, pluginTypes.length)
  for (const definition of definitions) {
    const renderer = renderers.get(definition.type)
    assert.equal(renderer?.type, definition.type)
    assert.equal(typeof renderer?.render, 'function')
    assert.strictEqual(renderer?.schema, definition.schema, `${definition.type} editor and renderer must share one schema object`)
    assert.ok(Array.isArray(renderer?.styles), `${definition.type} renderer must publish a style URL list`)
    if (definition.capabilities?.formatting?.inlineTools) {
      assert.equal(typeof definition.schema.mapRichText, 'function', `${definition.type} schema must own rich-text traversal`)
    }
  }
})

test('subset renderer preset is deterministic and ignores duplicate requests', () => {
  const renderers = createDefaultRenderers('contract', {}, ['paragraph', 'image', 'paragraph'])
  assert.deepEqual([...renderers.keys()], ['paragraph', 'image'])
})
