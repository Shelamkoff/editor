import assert from 'node:assert/strict'
import test from 'node:test'
import { invokeObserver } from './invokeObserver.js'

test('invokeObserver contains synchronous callback failures', () => {
  const errors = []
  assert.doesNotThrow(() => invokeObserver(
    () => { throw new Error('sync failure') },
    [],
    error => errors.push(error.message),
  ))
  assert.deepEqual(errors, ['sync failure'])
})

test('invokeObserver contains rejected callback promises', async () => {
  const errors = []
  invokeObserver(
    async () => { throw new Error('async failure') },
    [],
    error => errors.push(error.message),
  )
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(errors, ['async failure'])
})

test('invokeObserver also contains failures in the error reporter', async () => {
  assert.doesNotThrow(() => invokeObserver(
    () => { throw new Error('callback failure') },
    [],
    () => { throw new Error('reporter failure') },
  ))

  invokeObserver(
    async () => { throw new Error('async callback failure') },
    [],
    () => { throw new Error('async reporter failure') },
  )
  await Promise.resolve()
  await Promise.resolve()
})
