import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  createDefaultRenderers,
  getSupportedBlockTypes,
} from '../renderer/renderers/index.js'
import { BLOCK_TYPES } from '../shared/blockTypes.js'

const root = new URL('../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

test('editable plugins, output types and read-only renderers stay in sync', async () => {
  const pluginIndex = await source('plugins/index.js')
  const declarations = await source('renderer/types.d.ts')
  const exports = [...pluginIndex.matchAll(/export \{ (\w+) \} from '\.\/([^']+)\/index\.js'/g)]

  assert.equal(exports.length, BLOCK_TYPES.length, 'the complete preset must expose every canonical block plugin')

  const pluginTypes = []
  const inlineTypes = new Set()
  for (const [, className, directory] of exports) {
    const pluginSource = await source(`plugins/${directory}/index.js`)
    assert.match(pluginSource, new RegExp(`export class ${className} extends BlockPluginAbstract`))
    assert.match(pluginSource, /\n\s*render\s*\(/, `${className} must implement render()`)
    assert.match(pluginSource, /\n\s*save\s*\(/, `${className} must implement save()`)
    assert.match(pluginSource, /\n\s*validate\s*\(/, `${className} must define its validation policy`)
    const type = pluginSource.match(/\n\s*type\s*=\s*'([^']+)'/)?.[1]
    assert.ok(type, `${className} must declare a stable block type`)
    if (/\n\s*inlineTools\s*=\s*true\b/.test(pluginSource)) {
      assert.match(pluginSource, /\n\s*mapTextFields\s*=/, `${className} exposes inline tools and must marshal every HTML field`)
      inlineTypes.add(type)
    }
    pluginTypes.push(type)
  }

  assert.equal(new Set(pluginTypes).size, pluginTypes.length, 'plugin block types must be unique')

  const declaredTypes = [...declarations.matchAll(/OutputBlockData<'([^']+)'/g)].map(match => match[1])
  const rendererTypes = getSupportedBlockTypes()
  assert.deepEqual(sorted(pluginTypes), sorted(declaredTypes))
  assert.deepEqual(sorted(pluginTypes), sorted(rendererTypes))
  assert.deepEqual(rendererTypes, BLOCK_TYPES)

  const renderers = createDefaultRenderers('contract', {})
  assert.equal(renderers.size, pluginTypes.length)
  for (const type of pluginTypes) {
    const renderer = renderers.get(type)
    assert.equal(renderer?.type, type)
    assert.equal(typeof renderer?.render, 'function')
    assert.ok(Array.isArray(renderer?.styles), `${type} renderer must publish a style URL list`)
    if (inlineTypes.has(type)) {
      assert.equal(typeof renderer?.mapTextFields, 'function', `${type} renderer must mirror editor text-field marshalling`)
    }
  }
})

test('subset renderer preset is deterministic and ignores duplicate requests', () => {
  const renderers = createDefaultRenderers('contract', {}, ['paragraph', 'image', 'paragraph'])
  assert.deepEqual([...renderers.keys()], ['paragraph', 'image'])
})
