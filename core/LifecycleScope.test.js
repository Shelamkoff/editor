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

test('a throwing error sink cannot interrupt the remaining reverse-order cleanup', () => {
  const calls = []
  const scope = new LifecycleScope(() => {
    calls.push('sink')
    throw new Error('error sink failed')
  })
  scope.register({ destroy() { calls.push('first') } })
  scope.register({ destroy() { calls.push('broken'); throw new Error('cleanup failed') } })
  scope.register({ destroy() { calls.push('last') } })
  const warn = console.warn
  try {
    console.warn = () => {}
    assert.doesNotThrow(() => scope.destroy())
  } finally { console.warn = warn }
  scope.destroy()
  assert.deepEqual(calls, ['last', 'broken', 'sink', 'first'])
})

test('asynchronous rejection from an error sink stays contained', async () => {
  const errors = []
  const scope = new LifecycleScope(async error => {
    errors.push(error.message)
    throw new Error('async sink failed')
  })
  scope.register({ destroy() { throw new Error('resource failed') } })
  scope.register({ destroy() { errors.push('other released') } })
  const warn = console.warn
  try {
    console.warn = () => {}
    scope.destroy()
    for (let index = 0; index < 5; index++) await Promise.resolve()
  } finally { console.warn = warn }
  assert.deepEqual(errors, ['other released', 'resource failed'])
})

test('late registration failure still reports the destroyed-scope contract', () => {
  const errors = []
  const scope = new LifecycleScope(error => errors.push(error.message))
  scope.destroy()
  assert.throws(
    () => scope.register({ destroy() { throw new Error('late cleanup failed') } }),
    /Cannot register a resource in a destroyed lifecycle scope/,
  )
  assert.deepEqual(errors, ['late cleanup failed'])
})

test('asynchronous disposer completion cannot interrupt independent lifecycle cleanup', async () => {
  const destroyed = []
  const errors = []
  const scope = new LifecycleScope(error => errors.push(error.message))
  scope.register({ destroy() { destroyed.push('first') } })
  scope.register({
    destroy() {
      destroyed.push('async')
      return Promise.reject(new Error('late disposer failure'))
    },
  })
  scope.register({ destroy() { destroyed.push('last') } })
  assert.doesNotThrow(() => scope.destroy())
  for (let i = 0; i < 8; i++) await Promise.resolve()
  assert.deepEqual(destroyed, ['last', 'async', 'first'])
  assert.ok(errors.some(message => /must complete synchronously/.test(message)))
  assert.ok(errors.some(message => /late disposer failure/.test(message)))
})
