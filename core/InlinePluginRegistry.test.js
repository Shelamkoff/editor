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

test('mount failure cleans the failing plugin without double-destroying rollback participants', () => {
  const calls = []
  const makePlugin = (type, mount) => ({
    type,
    createWidget() {},
    hydrate() {},
    getData() {},
    mount,
    destroy() { calls.push(`destroy:${type}`) },
  })
  const first = makePlugin('first', () => calls.push('mount:first'))
  const failing = makePlugin('failing', () => {
    calls.push('mount:failing')
    throw new Error('mount failed')
  })
  const untouched = makePlugin('untouched', () => calls.push('mount:untouched'))
  const registry = new InlinePluginRegistry([first, failing, untouched])

  assert.throws(() => registry.mount({}, {}), /mount failed/)
  assert.deepEqual(calls, [
    'mount:first',
    'mount:failing',
    'destroy:failing',
    'destroy:first',
  ])

  registry.destroy()
  assert.deepEqual(calls, [
    'mount:first',
    'mount:failing',
    'destroy:failing',
    'destroy:first',
    'destroy:untouched',
  ])
})
