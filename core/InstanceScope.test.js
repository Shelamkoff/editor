import test from 'node:test'
import assert from 'node:assert/strict'

import { InstanceScope } from './InstanceScope.js'

function harness({ staged = true, generation = 1 } = {}) {
  let data = { value: 1, nested: { stable: true } }
  let phase = 'idle'
  let health = 'ready'
  let currentGeneration = generation
  const updates = []
  const ids = ['one', 'two', 'three']
  let idIndex = 0

  const scope = new InstanceScope({ staged, generation })
  scope.configure({
    readOnly: false,
    health: () => health,
    phase: () => phase,
    currentGeneration: () => currentGeneration,
  })
  const context = scope.createAuthority({
    readData: () => data,
    updateData(producer) {
      const next = producer(data)
      updates.push(next)
      data = next
    },
    commitDomMutation(operation) { operation() },
    createId: prefix => `${prefix}-${ids[idIndex++]}`,
  })

  return {
    scope,
    context,
    updates,
    data: () => data,
    setData: value => { data = value },
    setPhase: value => { phase = value },
    setHealth: value => { health = value },
    setGeneration: value => { currentGeneration = value },
  }
}

test('staged scope permits detached reads but rejects persisted mutation before producer', () => {
  const { scope, context, updates } = harness({ staged: true })
  const snapshot = context.getData()
  assert.deepEqual(snapshot, { value: 1, nested: { stable: true } })
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.nested), true)
  assert.throws(() => { snapshot.nested.stable = false }, TypeError)

  let producerCalls = 0
  assert.throws(
    () => context.updateData(current => {
      producerCalls++
      return { ...current, value: 2 }
    }),
    /staged/,
  )
  assert.equal(producerCalls, 0)
  assert.equal(updates.length, 0)

  scope.activate()
  context.updateData(current => ({ ...current, value: 2 }))
  assert.equal(updates.length, 1)
  assert.equal(context.getData().value, 2)
})

test('revoked scope makes retained mutation callbacks inert before producer and revokes reads', () => {
  const { scope, context, updates } = harness({ staged: false })
  let producerCalls = 0
  scope.revoke()

  context.updateData(current => {
    producerCalls++
    return { ...current, value: 2 }
  })
  assert.equal(producerCalls, 0)
  assert.equal(updates.length, 0)
  assert.throws(() => context.getData(), error => error?.name === 'AbortError')
  assert.throws(() => context.createId('x'), error => error?.name === 'AbortError')

  let operationCalls = 0
  context.commitDomMutation(() => { operationCalls++ })
  assert.equal(operationCalls, 0)
})

test('data task commits against latest live data once', () => {
  const { context, setData, data } = harness({ staged: false })
  const task = context.beginTask()
  setData({ value: 8, nested: { stable: true }, unrelated: 'latest' })

  let producerCalls = 0
  assert.equal(task.commit(current => {
    producerCalls++
    assert.equal(current.value, 8)
    assert.equal(current.unrelated, 'latest')
    return { ...current, value: 9 }
  }), true)
  assert.equal(data().value, 9)
  assert.equal(data().unrelated, 'latest')
  assert.equal(producerCalls, 1)

  assert.equal(task.commit(() => {
    producerCalls++
    return { value: 10 }
  }), false)
  assert.equal(producerCalls, 1)
})

test('read-only epoch cancels old tasks permanently across true to false transition', () => {
  const { scope, context, data } = harness({ staged: false })
  const old = context.beginTask()
  scope.setReadOnly(true)
  assert.equal(old.signal.aborted, true)
  scope.setReadOnly(false)

  let calls = 0
  assert.equal(old.commit(current => {
    calls++
    return { ...current, value: 2 }
  }), false)
  assert.equal(calls, 0)
  assert.equal(data().value, 1)

  const fresh = context.beginTask()
  assert.equal(fresh.commit(current => ({ ...current, value: 3 })), true)
  assert.equal(data().value, 3)
})

test('generation and phase guards prevent stale or reentrant task producers', () => {
  const stale = harness({ staged: false, generation: 5 })
  const staleTask = stale.context.beginTask()
  stale.setGeneration(6)
  let staleCalls = 0
  assert.equal(staleTask.commit(current => {
    staleCalls++
    return { ...current, value: 2 }
  }), false)
  assert.equal(staleCalls, 0)

  const reentrant = harness({ staged: false })
  const task = reentrant.context.beginTask()
  reentrant.setPhase('applying-projection')
  let reentrantCalls = 0
  assert.throws(
    () => task.commit(current => {
      reentrantCalls++
      return { ...current, value: 2 }
    }),
    /applying-projection/,
  )
  assert.equal(reentrantCalls, 0)
})

test('parent revoke and read-only propagate to child scopes and tasks', () => {
  const parentHarness = harness({ staged: false, generation: 3 })
  const child = new InstanceScope({
    staged: false,
    generation: 3,
    parent: parentHarness.scope,
  })
  let childData = { value: 1 }
  child.configure({
    health: () => 'ready',
    phase: () => 'idle',
    currentGeneration: () => 3,
  })
  const childContext = child.createAuthority({
    readData: () => childData,
    updateData(producer) { childData = producer(childData) },
    createId: prefix => prefix + '-id',
  })

  const task = childContext.beginTask()
  parentHarness.scope.setReadOnly(true)
  assert.equal(task.signal.aborted, true)
  assert.equal(childContext.isReadOnly(), true)

  parentHarness.scope.revoke()
  assert.equal(child.revoked, true)
  assert.throws(() => childContext.getData(), error => error?.name === 'AbortError')
})

test('validation or producer failure closes the task without retry', () => {
  let calls = 0
  const scope = new InstanceScope({ staged: false, generation: 1 })
  scope.configure({
    health: () => 'ready',
    phase: () => 'idle',
    currentGeneration: () => 1,
  })
  const context = scope.createAuthority({
    readData: () => ({ value: 1 }),
    updateData(producer) {
      producer({ value: 1 })
      throw new TypeError('validation failed')
    },
    createId: prefix => prefix + '-id',
  })
  const task = context.beginTask()
  assert.throws(() => task.commit(current => {
    calls++
    return { ...current, value: 2 }
  }), /validation failed/)
  assert.equal(calls, 1)
  assert.equal(task.signal.aborted, true)
  assert.equal(task.commit(() => {
    calls++
    return { value: 3 }
  }), false)
  assert.equal(calls, 1)
})
