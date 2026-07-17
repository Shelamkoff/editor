import assert from 'node:assert/strict'
import test from 'node:test'

import { InlinePluginRegistry } from './InlinePluginRegistry.js'

function plugin(trigger) {
  return {
    type: `trigger-${String(trigger)}`,
    trigger,
    createWidget() {},
    hydrate() {},
    getData() {},
  }
}

test('inline plugin triggers contain exactly one Unicode code point', () => {
  assert.throws(() => new InlinePluginRegistry([plugin('')]), /exactly one Unicode code point/)
  assert.throws(() => new InlinePluginRegistry([plugin('ab')]), /exactly one Unicode code point/)
  assert.doesNotThrow(() => new InlinePluginRegistry([plugin('💡')]))
})

test('inline plugin trigger characters are unique', () => {
  const first = plugin('@')
  const second = { ...plugin('@'), type: 'another-mention' }
  assert.throws(() => new InlinePluginRegistry([first, second]), /Duplicate inline plugin trigger/)
})
