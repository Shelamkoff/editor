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


test('async plugin preset snapshots requested configs before dynamic imports settle', async () => {
  const paragraphConfig = { placeholder: 'before' }
  const configs = { paragraph: paragraphConfig }
  const pending = createBlockPluginsAsync(['paragraph'], configs)

  paragraphConfig.placeholder = 'mutated'
  configs.paragraph = { placeholder: 'replacement' }

  const [plugin] = await pending
  assert.equal(plugin.getPluginConfig().placeholder, 'before')
})

test('async renderer preset observes requested config and locale before the import boundary', async () => {
  let configReads = 0
  let localeReads = 0
  const configs = {}
  Object.defineProperty(configs, 'paragraph', {
    enumerable: true,
    configurable: true,
    get() {
      configReads++
      return { marker: 'before' }
    },
  })
  const locale = {}
  Object.defineProperty(locale, 'renderer.paragraph.probe', {
    enumerable: true,
    configurable: true,
    get() {
      localeReads++
      return 'before'
    },
  })

  const pending = createDefaultRenderersAsync('async-contract', locale, ['paragraph'], configs)
  assert.equal(configReads, 1, 'requested renderer config must cross the boundary before import awaits')
  assert.equal(localeReads, 1, 'locale entries must cross the boundary before import awaits')

  Object.defineProperty(configs, 'paragraph', {
    enumerable: true,
    configurable: true,
    value: { marker: 'after' },
  })
  Object.defineProperty(locale, 'renderer.paragraph.probe', {
    enumerable: true,
    configurable: true,
    value: 'after',
  })

  const renderers = await pending
  assert.equal(renderers.get('paragraph')?.type, 'paragraph')
  assert.equal(configReads, 1)
  assert.equal(localeReads, 1)
})


test('async Poll renderer snapshots nested adapter methods before imports settle', async () => {
  const reads = { poll: 0, dataSource: 0, load: 0, vote: 0, subscribe: 0 }
  const adapter = {
    get load() {
      reads.load++
      if (reads.load > 1) throw new Error('load getter reread')
      return async () => ({ total: 0, options: [] })
    },
    get vote() {
      reads.vote++
      if (reads.vote > 1) throw new Error('vote getter reread')
      return async () => ({ total: 0, options: [] })
    },
    get subscribe() {
      reads.subscribe++
      if (reads.subscribe > 1) throw new Error('subscribe getter reread')
      return undefined
    },
  }
  const poll = {
    get dataSource() {
      reads.dataSource++
      if (reads.dataSource > 1) throw new Error('dataSource getter reread')
      return adapter
    },
  }
  const configs = {}
  Object.defineProperty(configs, 'poll', {
    enumerable: true,
    configurable: true,
    get() {
      reads.poll++
      if (reads.poll > 1) throw new Error('Poll config getter reread')
      return poll
    },
  })

  const pending = createDefaultRenderersAsync('async-contract', {}, ['poll'], configs)
  assert.deepEqual(reads, { poll: 1, dataSource: 1, load: 1, vote: 1, subscribe: 1 })

  const renderers = await pending
  assert.equal(renderers.get('poll')?.type, 'poll')
  assert.deepEqual(reads, { poll: 1, dataSource: 1, load: 1, vote: 1, subscribe: 1 })
})
