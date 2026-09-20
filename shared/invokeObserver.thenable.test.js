import test from 'node:test'
import assert from 'node:assert/strict'
import { invokeObserver } from './invokeObserver.js'

const settle = () => new Promise(resolve => setImmediate(resolve))

test('observer adopts the inspected then method once with its original receiver', async () => {
  const errors = []
  const failure = new Error('original rejection')
  let reads = 0
  let calls = 0
  let receiver
  const result = {
    get then() {
      reads++
      return reads === 1
        ? function (_resolve, reject) { calls++; receiver = this; reject(failure) }
        : function (resolve) { resolve() }
    },
  }
  invokeObserver(() => result, [], error => errors.push(error))
  await settle()
  assert.equal(reads, 1)
  assert.equal(calls, 1)
  assert.strictEqual(receiver, result)
  assert.deepEqual(errors, [failure])
})

test('observer still settles when reading then a second time would throw', async () => {
  let reads = 0
  let calls = 0
  const errors = []
  const result = {
    get then() {
      if (++reads > 1) throw new Error('unexpected second read')
      return function (resolve) { calls++; resolve() }
    },
  }
  invokeObserver(() => result, [], error => errors.push(error))
  await settle()
  assert.equal(reads, 1)
  assert.equal(calls, 1)
  assert.deepEqual(errors, [])
})

test('observer contains throwing then accessors and a thenable that rejects twice', async () => {
  const getterError = new Error('getter failed')
  const firstError = new Error('first rejection')
  const errors = []
  invokeObserver(() => ({ get then() { throw getterError } }), [], error => errors.push(error))
  invokeObserver(() => ({ then(_resolve, reject) {
    reject(firstError)
    reject(new Error('second rejection'))
    throw new Error('after rejection')
  } }), [], error => errors.push(error))
  await settle()
  assert.deepEqual(errors, [getterError, firstError])
})
