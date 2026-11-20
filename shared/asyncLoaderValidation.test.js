import assert from 'node:assert/strict'
import test from 'node:test'
import { loadBlockPluginDefinition, preloadBlockPluginDefinitions, createBlockPluginsAsync } from '../plugins/async.js'
import { loadRendererFactory, preloadRendererFactories, createDefaultRenderersAsync } from '../renderer/renderers/async.js'

for (const type of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty', '__defineGetter__', 'missing', '']) {
  test(`async plugin APIs reject unsupported own/prototype key ${JSON.stringify(type)}`, async () => {
    await assert.rejects(() => loadBlockPluginDefinition(type), RangeError)
    await assert.rejects(() => preloadBlockPluginDefinitions(['paragraph', type]), RangeError)
    await assert.rejects(() => createBlockPluginsAsync([type]), RangeError)
  })
  test(`async renderer APIs reject unsupported own/prototype key ${JSON.stringify(type)}`, async () => {
    await assert.rejects(() => loadRendererFactory(type), RangeError)
    await assert.rejects(() => preloadRendererFactories(['paragraph', type]), RangeError)
    await assert.rejects(() => createDefaultRenderersAsync('test', {}, [type]), RangeError)
  })
}
test('ordinary async loaders still return the requested usable types', async () => {
  const paragraph = await loadBlockPluginDefinition('paragraph')
  assert.equal(paragraph.type, 'paragraph')
  const factory = await loadRendererFactory('paragraph')
  assert.equal(factory('test', {}).type, 'paragraph')
})

for (const [label, preload] of [
  ['plugin', preloadBlockPluginDefinitions],
  ['renderer', preloadRendererFactories],
]) {
  test(`async ${label} preload keeps the captured type list length`, async () => {
    const types = ['paragraph']
    Object.defineProperty(types, '0', {
      get() { types.push('delimiter'); return 'paragraph' },
    })

    assert.deepEqual([...(await preload(types)).keys()], ['paragraph'])
  })

  test(`async ${label} preload rejects a type removed during capture`, async () => {
    const types = ['paragraph', 'delimiter']
    Object.defineProperty(types, '0', {
      get() { types.length = 1; return 'paragraph' },
    })

    await assert.rejects(() => preload(types), RangeError)
  })
}

test('async loaders reject nonstring type keys before coercion', async () => {
  let reads = 0
  const type = { toString() { reads++; return 'paragraph' } }
  for (const request of [
    () => loadBlockPluginDefinition(type),
    () => loadRendererFactory(type),
    () => preloadBlockPluginDefinitions([type]),
    () => preloadRendererFactories([type]),
    () => createDefaultRenderersAsync('test', {}, [type]),
  ]) {
    await assert.rejects(request, /type must be a string/)
    assert.equal(reads, 0)
  }
})
