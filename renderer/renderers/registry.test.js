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


test('synchronous renderer config maps ignore inherited block type keys', () => {
  let reads = 0
  const prototype = {}
  Object.defineProperty(prototype, 'paragraph', {
    enumerable: true,
    get() { reads++; throw new Error('inherited paragraph config accessed') },
  })
  const configs = Object.create(prototype)
  const defaults = createDefaultRenderers('test', {}, ['paragraph'], configs)
  assert.equal(defaults.get('paragraph')?.type, 'paragraph')
  assert.equal(reads, 0)
})

test('synchronous renderer type lists ignore inherited sparse entries', () => {
  let reads = 0
  const prototype = Object.create(Array.prototype)
  Object.defineProperty(prototype, '0', {
    configurable: true,
    get() { reads++; return 'paragraph' },
  })
  const types = []
  Object.setPrototypeOf(types, prototype)
  types.length = 1

  const defaults = createDefaultRenderers('test', {}, types)
  assert.equal(defaults.size, 0)
  assert.equal(reads, 0)
})

test('synchronous renderer factories capture the requested type list length once', () => {
  const source = ['paragraph']
  let lengthReads = 0
  const types = new Proxy(source, {
    get(target, key, receiver) {
      if (key === 'length') lengthReads++
      if (key === '0') target.push('delimiter')
      return Reflect.get(target, key, receiver)
    },
  })

  assert.deepEqual([...createDefaultRenderers('test', {}, types).keys()], ['paragraph'])
  assert.equal(lengthReads, 1)
})

test('synchronous renderer factories ignore nonstring keys without coercion', () => {
  let reads = 0
  const type = { toString() { reads++; return 'paragraph' } }

  assert.equal(createRenderer(type, 'test'), null)
  assert.deepEqual([...createDefaultRenderers('test', {}, [type, 'paragraph']).keys()], ['paragraph'])
  assert.equal(reads, 0)
})
