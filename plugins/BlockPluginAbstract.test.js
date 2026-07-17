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
