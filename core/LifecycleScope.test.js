import assert from 'node:assert/strict'
import test from 'node:test'
import { LifecycleScope } from './LifecycleScope.js'

test('lifecycle scope destroys resources once in reverse order', () => {
  const order = []
  const scope = new LifecycleScope()
  scope.register({ destroy() { order.push('first') } })
  scope.register({ destroy() { order.push('second') } })
  scope.destroy()
  scope.destroy()
  assert.deepEqual(order, ['second', 'first'])
})

test('registering after destruction releases the resource immediately', () => {
  let destroyed = 0
  const scope = new LifecycleScope()
  scope.destroy()
  assert.throws(
    () => scope.register({ destroy() { destroyed++ } }),
    /destroyed lifecycle scope/,
  )
  assert.equal(destroyed, 1)
})

test('LifecycleScope routes cleanup failures through its error sink and keeps destroying', () => {
  const errors = []
  const calls = []
  const scope = new LifecycleScope(error => errors.push(error.message))
  scope.register({ destroy() { calls.push('first') } })
  scope.register({ destroy() { calls.push('broken'); throw new Error('cleanup failed') } })
  scope.register({ destroy() { calls.push('last') } })

  assert.doesNotThrow(() => scope.destroy())
  assert.deepEqual(calls, ['last', 'broken', 'first'])
  assert.deepEqual(errors, ['cleanup failed'])
})
