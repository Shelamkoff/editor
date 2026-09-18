import assert from 'node:assert/strict'
import test from 'node:test'
import { Diagnostics } from './Diagnostics.js'

test('diagnostics are deferred, content-free, frozen and callback failures are isolated', async () => {
  const received = []
  const diagnostics = new Diagnostics(event => {
    received.push(event)
    throw new Error('consumer diagnostic failure')
  }, { commandMs: 5 })

  assert.doesNotThrow(() => diagnostics.emit('command.failed', {
    operation: 'block.insert',
    errorName: 'TypeError',
  }))
  assert.equal(received.length, 0, 'diagnostic observer must not run inside editor control flow')
  await Promise.resolve()
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


test('diagnostics contain rejected observer promises', async () => {
  let calls = 0
  const diagnostics = new Diagnostics(async () => {
    calls++
    throw new Error('async diagnostic failure')
  })

  diagnostics.emit('command.failed', { operation: 'test', errorName: 'Error' })
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(calls, 1)
})


test('diagnostics suppress synchronous observer feedback loops', async () => {
  const received = []
  let diagnostics
  diagnostics = new Diagnostics(event => {
    received.push(event.code)
    diagnostics.emit('command.slow', { operation: 'observer-child', durationMs: 1 })
  })

  diagnostics.emit('command.slow', { operation: 'parent', durationMs: 1 })
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(received, ['command.slow'])
})
