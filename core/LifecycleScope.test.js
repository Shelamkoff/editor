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
