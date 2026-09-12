import assert from 'node:assert/strict'
import test from 'node:test'
import { preloadBlockPlugins, createBlockPluginsAsync } from '../plugins/async.js'
import { createRendererAsync, preloadRendererFactories, createDefaultRenderersAsync } from '../renderer/renderers/async.js'

test('async plugin helpers reject malformed source and configuration shapes', async () => {
  await assert.rejects(() => preloadBlockPlugins('paragraph'), /source must be an array or document object/)
  await assert.rejects(() => preloadBlockPlugins({ blocks: 'paragraph' }), /source.blocks must be an array/)
  await assert.rejects(() => createBlockPluginsAsync(['paragraph'], 'invalid'), /configs must be an object/)
  await assert.rejects(() => createBlockPluginsAsync(['paragraph'], { paragraph: 'invalid' }), /configs.paragraph must be an object/)
})

test('async renderer helpers reject malformed public argument shapes', async () => {
  await assert.rejects(() => preloadRendererFactories('paragraph'), /source must be an array or document object/)
  await assert.rejects(() => preloadRendererFactories({ blocks: 'paragraph' }), /source.blocks must be an array/)
  await assert.rejects(() => createRendererAsync('paragraph', 42), /classPrefix must be a string/)
  await assert.rejects(() => createRendererAsync('paragraph', 'x', []), /locale must be an object/)
  await assert.rejects(() => createDefaultRenderersAsync('x', {}, ['paragraph'], []), /configs must be an object/)
})


test('async preset config maps ignore inherited block type keys', async () => {
  let reads = 0
  const prototype = {}
  Object.defineProperty(prototype, 'paragraph', {
    enumerable: true,
    get() { reads++; throw new Error('inherited paragraph config accessed') },
  })
  const configs = Object.create(prototype)

  const plugins = await createBlockPluginsAsync(['paragraph'], configs)
  assert.equal(plugins.length, 1)
  const renderers = await createDefaultRenderersAsync('x', {}, ['paragraph'], configs)
  assert.equal(renderers.size, 1)
  assert.equal(reads, 0)
})


test('async preset document sources ignore inherited block collections and types', async () => {
  let blocksReads = 0
  const sourcePrototype = {}
  Object.defineProperty(sourcePrototype, 'blocks', {
    enumerable: true,
    get() { blocksReads++; throw new Error('inherited blocks accessed') },
  })
  const source = Object.create(sourcePrototype)

  const plugins = await preloadBlockPlugins(source)
  const renderers = await preloadRendererFactories(source)
  assert.equal(plugins.size, renderers.size)
  assert.equal(blocksReads, 0)

  let typeReads = 0
  const blockPrototype = {}
  Object.defineProperty(blockPrototype, 'type', {
    enumerable: true,
    get() { typeReads++; return 'paragraph' },
  })
  const inheritedTypeSource = { blocks: [Object.create(blockPrototype)] }

  await assert.rejects(() => preloadBlockPlugins(inheritedTypeSource), RangeError)
  await assert.rejects(() => preloadRendererFactories(inheritedTypeSource), RangeError)
  assert.equal(typeReads, 0)
})
