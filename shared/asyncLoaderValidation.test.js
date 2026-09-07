import assert from 'node:assert/strict'
import test from 'node:test'
import { loadBlockPlugin, preloadBlockPlugins, createBlockPluginsAsync } from '../plugins/async.js'
import { loadRendererFactory, preloadRendererFactories, createDefaultRenderersAsync } from '../renderer/renderers/async.js'

for (const type of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty', '__defineGetter__', 'missing', '']) {
  test(`async plugin APIs reject unsupported own/prototype key ${JSON.stringify(type)}`, async () => {
    await assert.rejects(() => loadBlockPlugin(type), RangeError)
    await assert.rejects(() => preloadBlockPlugins(['paragraph', type]), RangeError)
    await assert.rejects(() => createBlockPluginsAsync([type]), RangeError)
  })
  test(`async renderer APIs reject unsupported own/prototype key ${JSON.stringify(type)}`, async () => {
    await assert.rejects(() => loadRendererFactory(type), RangeError)
    await assert.rejects(() => preloadRendererFactories(['paragraph', type]), RangeError)
    await assert.rejects(() => createDefaultRenderersAsync('test', {}, [type]), RangeError)
  })
}
test('ordinary async loaders still return the requested usable types', async () => {
  const Paragraph = await loadBlockPlugin('paragraph')
  assert.equal(new Paragraph().type, 'paragraph')
  const factory = await loadRendererFactory('paragraph')
  assert.equal(factory('test', {}).type, 'paragraph')
})
