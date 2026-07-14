import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createBlockPluginsAsync,
  getAsyncBlockPluginTypes,
  preloadBlockPlugins,
} from '../plugins/async.js'
import {
  createDefaultRenderersAsync,
  getAsyncRendererTypes,
  preloadRendererFactories,
} from '../renderer/async.js'
import { getSupportedBlockTypes } from '../renderer/renderers/index.js'
import { BLOCK_TYPES } from './blockTypes.js'

test('async presets share the canonical full block type order', () => {
  assert.deepEqual(getAsyncBlockPluginTypes(), BLOCK_TYPES)
  assert.deepEqual(getAsyncRendererTypes(), BLOCK_TYPES)
  assert.deepEqual(getSupportedBlockTypes(), BLOCK_TYPES)
  assert.notEqual(getAsyncBlockPluginTypes(), BLOCK_TYPES, 'public arrays must be isolated')
})

test('async plugin preset preloads only unique document types', async () => {
  const document = {
    blocks: [
      { type: 'paragraph', data: { text: 'one' } },
      { type: 'delimiter', data: {} },
      { type: 'paragraph', data: { text: 'two' } },
    ],
  }
  const constructors = await preloadBlockPlugins(document)
  assert.deepEqual([...constructors.keys()], ['paragraph', 'delimiter'])

  const plugins = await createBlockPluginsAsync(document)
  assert.deepEqual(plugins.map(plugin => plugin.type), ['paragraph', 'delimiter'])
})

test('async renderer preset preloads only unique document types', async () => {
  const document = {
    blocks: [
      { type: 'paragraph', data: { text: 'one' } },
      { type: 'delimiter', data: {} },
      { type: 'paragraph', data: { text: 'two' } },
    ],
  }
  const factories = await preloadRendererFactories(document)
  assert.deepEqual([...factories.keys()], ['paragraph', 'delimiter'])

  const renderers = await createDefaultRenderersAsync('async-contract', {}, document)
  assert.deepEqual([...renderers.keys()], ['paragraph', 'delimiter'])
  assert.equal(renderers.get('paragraph')?.type, 'paragraph')
})

test('unknown async types fail before a preset is created', async () => {
  await assert.rejects(() => preloadBlockPlugins(['paragraph', 'missing']), /Unknown editor block plugin type: missing/)
  await assert.rejects(() => preloadRendererFactories(['paragraph', 'missing']), /Unknown editor renderer type: missing/)
})
