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


test('structured clipboard capabilities produce valid selected and remaining current data', () => {
  const factories = Object.entries(pluginPreset)
    .filter(([name, value]) => /^create.+Plugin$/.test(name) && typeof value === 'function')
  const definitions = new Map(factories.map(([, factory]) => {
    const definition = factory()
    return [definition.type, definition]
  }))

  const cases = [
    ['list', {
      style: 'ordered',
      items: [{ id: 'i1', text: 'Alpha' }, { id: 'i2', text: 'Bravo' }],
    }, new Map([
      ['item:i1', { fieldKey: 'item:i1', before: 'Al', selected: 'pha', after: '', whole: false }],
      ['item:i2', { fieldKey: 'item:i2', before: '', selected: 'Br', after: 'avo', whole: false }],
    ])],
    ['checklist', {
      items: [{ id: 'i1', text: 'Alpha', checked: true }, { id: 'i2', text: 'Bravo', checked: false }],
    }, new Map([
      ['item:i1', { fieldKey: 'item:i1', before: 'Al', selected: 'pha', after: '', whole: false }],
      ['item:i2', { fieldKey: 'item:i2', before: '', selected: 'Br', after: 'avo', whole: false }],
    ])],
    ['columns', {
      layout: '1-1',
      columns: [{ id: 'c1', content: 'Alpha' }, { id: 'c2', content: 'Bravo' }],
    }, new Map([
      ['column:c1', { fieldKey: 'column:c1', before: 'Al', selected: 'pha', after: '', whole: false }],
      ['column:c2', { fieldKey: 'column:c2', before: '', selected: 'Br', after: 'avo', whole: false }],
    ])],
    ['table', {
      withHeadings: true,
      rows: [
        { id: 'r1', cells: [{ id: 'c11', text: 'A1' }, { id: 'c12', text: 'A2' }] },
        { id: 'r2', cells: [{ id: 'c21', text: 'B1' }, { id: 'c22', text: 'B2' }] },
      ],
    }, new Map([
      ['cell:r1:c11', { fieldKey: 'cell:r1:c11', before: '', selected: 'A1', after: '', whole: true }],
      ['cell:r2:c22', { fieldKey: 'cell:r2:c22', before: '', selected: 'B2', after: '', whole: true }],
    ])],
    ['quote', {
      text: 'First quote',
      caption: 'First caption',
    }, new Map([
      ['text', { fieldKey: 'text', before: 'Fi', selected: 'rst quote', after: '', whole: false }],
      ['caption', { fieldKey: 'caption', before: '', selected: 'First', after: ' caption', whole: false }],
    ])],
    ['warning', {
      title: 'Warning title',
      message: 'Warning message',
    }, new Map([
      ['title', { fieldKey: 'title', before: 'Warning ', selected: 'title', after: '', whole: false }],
      ['message', { fieldKey: 'message', before: '', selected: 'Warning', after: ' message', whole: false }],
    ])],
    ['toggle', {
      title: 'Toggle title',
      content: 'Toggle content',
      open: true,
    }, new Map([
      ['title', { fieldKey: 'title', before: 'Toggle ', selected: 'title', after: '', whole: false }],
      ['content', { fieldKey: 'content', before: '', selected: 'Toggle', after: ' content', whole: false }],
    ])],
    ['spoiler', {
      label: 'Spoiler label',
      content: 'Spoiler content',
    }, new Map([
      ['label', { fieldKey: 'label', before: 'Spoiler ', selected: 'label', after: '', whole: false }],
      ['content', { fieldKey: 'content', before: '', selected: 'Spoiler', after: ' content', whole: false }],
    ])],
  ]

  let id = 0
  for (const [type, data, fields] of cases) {
    const definition = definitions.get(type)
    assert.ok(definition, `missing structured plugin ${type}`)
    const clipboard = definition.capabilities?.clipboard
    assert.equal(typeof clipboard?.slice, 'function', `${type} must expose clipboard.slice()`)

    const result = clipboard.slice(data, {
      createId(prefix) { id++; return `${prefix}-contract-${id}` },
      field(key) { return fields.get(key) ?? null },
    })

    assert.ok(Array.isArray(result.parts) && result.parts.length > 0, `${type} clipboard slice has no parts`)
    for (const part of result.parts) {
      if (part.kind !== 'local-block') continue
      const encoded = definition.schema.encode(part.data)
      assert.equal(encoded.dataVersion, definition.schema.currentVersion)
      assert.deepEqual(definition.schema.decode(encoded).data, encoded.data)
    }
    if (result.remaining !== null) {
      const encoded = definition.schema.encode(result.remaining)
      assert.equal(encoded.dataVersion, definition.schema.currentVersion)
      assert.deepEqual(definition.schema.decode(encoded).data, encoded.data)
    }
  }
})
