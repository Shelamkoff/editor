import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, createDefaultRenderers, getSupportedBlockTypes } from './index.js'

for (const type of ['missing', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
  test(`synchronous renderer factories reject unregistered type ${type}`, () => {
    assert.equal(createRenderer(type, 'test'), null)
    const defaults = createDefaultRenderers('test', {}, ['paragraph', type, 'paragraph'])
    assert.deepEqual([...defaults.keys()], ['paragraph'])
    assert.equal(typeof defaults.get('paragraph').render, 'function')
  })
}
test('synchronous renderer factories still create every registered renderer', () => {
  const all = createDefaultRenderers('test', {})
  for (const type of getSupportedBlockTypes()) {
    assert.equal(createRenderer(type, 'test').type, type)
    assert.equal(typeof all.get(type).render, 'function')
  }
})
