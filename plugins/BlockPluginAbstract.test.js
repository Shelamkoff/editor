import test from 'node:test'
import assert from 'node:assert/strict'
import { BlockPluginAbstract } from './BlockPluginAbstract.js'

class TestPlugin extends BlockPluginAbstract {}

test('BlockPluginAbstract snapshots configuration without freezing the consumer object', () => {
  const config = { enabled: true }
  const plugin = new TestPlugin(config)

  assert.notEqual(plugin.getPluginConfig(), config)
  assert.equal(Object.isFrozen(plugin.getPluginConfig()), true)
  assert.equal(Object.isFrozen(config), false)

  config.enabled = false
  assert.equal(plugin.getPluginConfig().enabled, true)
})

test('BlockPluginAbstract validates shared runtime style options', () => {
  for (const invalid of [null, 'oops', [], 42]) {
    assert.throws(() => new TestPlugin(invalid), /configuration must be an object/)
  }
  assert.throws(() => new TestPlugin({ injectStyles: 'false' }), /injectStyles must be a boolean/)
  assert.throws(() => new TestPlugin({ css: 42 }), /css must be a string/)

  assert.equal(new TestPlugin({ injectStyles: false, css: '/plugin.css' }).getPluginConfig().injectStyles, false)
})
