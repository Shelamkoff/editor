import assert from 'node:assert/strict'
import test from 'node:test'
import { Diagnostics } from './Diagnostics.js'

test('diagnostics are content-free, frozen and callback failures are isolated', () => {
  const received = []
  const diagnostics = new Diagnostics(event => {
    received.push(event)
    throw new Error('consumer diagnostic failure')
  }, { commandMs: 5 })

  assert.doesNotThrow(() => diagnostics.emit('command.failed', {
    operation: 'block.insert',
    errorName: 'TypeError',
  }))
  assert.equal(received.length, 1)
  assert.equal(Object.isFrozen(received[0]), true)
  assert.equal(diagnostics.threshold('commandMs'), 5)
  assert.equal('content' in received[0], false)
})

test('diagnostic thresholds reject invalid durations', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '10']) {
    assert.throws(
      () => new Diagnostics(() => {}, { commandMs: value }),
      /diagnosticThresholds\.commandMs/,
    )
  }
  assert.doesNotThrow(() => new Diagnostics(() => {}, { commandMs: 0 }))
})

test('diagnostic thresholds ignore inherited values without reading them', () => {
  let reads = 0
  const prototype = {}
  for (const key of ['commandMs', 'saveMs', 'renderMs', 'pasteMs']) {
    Object.defineProperty(prototype, key, {
      configurable: true,
      get() { reads++; throw new Error(`inherited diagnostic ${key} accessed`) },
    })
  }
  const thresholds = Object.create(prototype)
  const diagnostics = new Diagnostics(() => {}, thresholds)
  for (const key of ['commandMs', 'saveMs', 'renderMs', 'pasteMs']) {
    assert.equal(diagnostics.threshold(key), Infinity)
  }
  assert.equal(reads, 0)
})
