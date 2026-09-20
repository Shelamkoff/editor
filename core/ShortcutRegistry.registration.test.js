import test from 'node:test'
import assert from 'node:assert/strict'
import { ShortcutRegistry } from './ShortcutRegistry.js'

const key = () => ({ code: 'KeyB', key: 'b', ctrlKey: true, preventDefault() {} })

test('unregister removes the binding it owns', () => {
  const registry = new ShortcutRegistry()
  let calls = 0
  const unregister = registry.register('Mod+B', () => calls++)
  assert.equal(registry.handle(key()), true)
  unregister()
  assert.equal(registry.handle(key()), false)
  assert.equal(calls, 1)
})

test('unregister of a replaced binding preserves the replacement', () => {
  const registry = new ShortcutRegistry()
  const calls = []
  const old = registry.register('Mod+B', () => calls.push('old'))
  registry.register('Mod+B', () => calls.push('new'))
  old()
  assert.equal(registry.handle(key()), true)
  assert.deepEqual(calls, ['new'])
})

test('stale unregister after clear does not remove a new binding', () => {
  const registry = new ShortcutRegistry()
  const old = registry.register('Mod+B', () => {})
  registry.clear()
  const calls = []
  registry.register('Mod+B', () => calls.push('new'))
  old()
  assert.equal(registry.handle(key()), true)
  assert.deepEqual(calls, ['new'])
})

test('unregister is idempotent across later registrations', () => {
  const registry = new ShortcutRegistry()
  const old = registry.register('Mod+B', () => {})
  old()
  const calls = []
  registry.register('Mod+B', () => calls.push('new'))
  old()
  assert.equal(registry.handle(key()), true)
  assert.deepEqual(calls, ['new'])
})

test('normalized aliases retain registration ownership', () => {
  const registry = new ShortcutRegistry()
  const old = registry.register('Ctrl+B', () => {})
  const calls = []
  registry.register('Mod+B', () => calls.push('new'))
  old()
  assert.equal(registry.handle(key()), true)
  assert.deepEqual(calls, ['new'])
})
