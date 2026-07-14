// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import { DocumentSnapshotStore } from './DocumentSnapshotStore.js'

function createBlock(id, readData) {
  let saveCalls = 0
  const block = {
    id,
    type: 'test',
    version: 0,
    plugin: {
      type: 'test',
      validate: () => true,
    },
    save() {
      saveCalls++
      return {
        id,
        type: 'test',
        data: readData(),
      }
    },
    get saveCalls() {
      return saveCalls
    },
  }
  return block
}

function createStore(blocks) {
  const blockReader = {
    [Symbol.iterator]() {
      return blocks[Symbol.iterator]()
    },
  }

  return new DocumentSnapshotStore(/** @type {any} */ (blockReader), null, {})
}

test('snapshot cache serializes only blocks whose version changed', () => {
  let value = 'first'
  const block = createBlock('a', () => ({ nested: { value } }))
  const store = createStore([block])

  const first = store.capture()
  const second = store.capture()

  assert.equal(block.saveCalls, 1)
  assert.equal(first.blocks[0], second.blocks[0])

  value = 'second'
  block.version++
  const third = store.capture()

  assert.equal(block.saveCalls, 2)
  assert.notEqual(third.blocks[0], second.blocks[0])
  assert.equal(third.blocks[0].data.nested.value, 'second')
})

test('public save result cannot mutate a cached internal snapshot', () => {
  const block = createBlock('a', () => ({ nested: { value: 'safe' } }))
  const store = createStore([block])

  const publicDocument = store.save()
  publicDocument.blocks[0].data.nested.value = 'mutated'

  const next = store.save()
  assert.equal(next.blocks[0].data.nested.value, 'safe')
  assert.equal(block.saveCalls, 1)
})

test('block save failure aborts the document transaction', () => {
  const valid = createBlock('valid', () => ({ value: 'kept' }))
  const broken = createBlock('broken', () => {
    throw new Error('plugin failed')
  })
  const store = createStore([valid, broken])

  assert.throws(
    () => store.save(),
    /Failed to save block broken \(test\)/,
  )
})
