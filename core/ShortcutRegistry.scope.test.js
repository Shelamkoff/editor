import test from 'node:test'
import assert from 'node:assert/strict'
import { ShortcutRegistry } from './ShortcutRegistry.js'

const key = () => ({ code: 'KeyK', key: 'k', ctrlKey: true, defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true } })

test('an inactive shortcut does not run or consume the browser key', () => {
  const registry = new ShortcutRegistry()
  let calls = 0
  registry.register('Mod+K', () => calls++, { when: () => false })
  const event = key()
  assert.equal(registry.handle(event), false)
  assert.equal(event.defaultPrevented, false)
  assert.equal(calls, 0)
})

test('matching shortcuts are selected using the current block predicate', () => {
  const registry = new ShortcutRegistry(), calls = []
  let active = 'paragraph'
  for (const type of ['paragraph', 'code']) {
    registry.register('Mod+K', () => calls.push(type), { when: () => active === type })
  }
  registry.handle(key())
  active = 'code'
  registry.handle(key())
  assert.deepEqual(calls, ['paragraph', 'code'])
})

test('a later content binding does not hide an editor-scoped binding', () => {
  const registry = new ShortcutRegistry(), calls = []
  registry.register('Mod+K', () => calls.push('editor'), { scope: 'editor' })
  registry.register('Mod+K', () => calls.push('content'))
  assert.equal(registry.handle(key(), 'editor'), true)
  assert.deepEqual(calls, ['editor'])
})

test('an inactive block binding falls back to an earlier inline binding', () => {
  const registry = new ShortcutRegistry(), calls = []
  registry.register('Mod+K', () => calls.push('inline'))
  registry.register('Mod+K', () => calls.push('block'), { when: () => false })
  assert.equal(registry.handle(key()), true)
  assert.deepEqual(calls, ['inline'])
})

test('unregistering a scoped binding leaves the other block types available', () => {
  const registry = new ShortcutRegistry(), calls = []
  registry.register('Mod+K', () => calls.push('paragraph'), { when: () => true })
  const remove = registry.register('Mod+K', () => calls.push('code'), { when: () => true })
  remove()
  assert.equal(registry.handle(key()), true)
  assert.deepEqual(calls, ['paragraph'])
})
