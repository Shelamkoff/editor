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


test('data task rejects a recursive commit before invoking its second producer', () => {
  const { context, data, updates } = harness({ staged: false })
  const task = context.beginTask()
  let nestedCalls = 0
  const result = task.commit(current => {
    assert.equal(task.commit(() => { nestedCalls++; return { value: 100 } }), false)
    return { ...current, value: 2 }
  })
  assert.equal(result, true)
  assert.equal(nestedCalls, 0)
  assert.equal(updates.length, 1)
  assert.equal(data().value, 2)
  assert.equal(task.signal.aborted, false)
  assert.equal(task.commit(() => { throw new Error('Already committed') }), false)
})

test('attaching to an already revoked parent revokes the late child before it can mutate', () => {
  const parent = new InstanceScope({ staged: false })
  parent.revoke()
  const child = new InstanceScope({ staged: false })
  assert.throws(() => child.attachParent(parent), error => error?.name === 'AbortError')
  assert.equal(child.revoked, true)
  let changed = 0
  assert.equal(child.runMutation(() => changed++), false)
  assert.equal(changed, 0)
  assert.throws(
    () => new InstanceScope({ staged: false, parent }),
    error => error?.name === 'AbortError',
  )
})

test('instance scopes reject parent cycles before read-only propagation', () => {
  const root = new InstanceScope({ staged: false })
  const child = new InstanceScope({ staged: false, parent: root })
  assert.throws(() => root.attachParent(child), /parent cycle/)
  root.setReadOnly(true)
  assert.equal(root.readOnly, true)
  assert.equal(child.readOnly, true)
  root.revoke()
  assert.equal(child.revoked, true)
})

test('late child inherits the parent read-only state and may resume when lifted', () => {
  const root = new InstanceScope({ staged: false })
  root.setReadOnly(true)
  const child = new InstanceScope({ staged: false, parent: root })
  let changed = 0
  assert.equal(child.readOnly, true)
  assert.equal(child.runMutation(() => changed++), false)
  root.setReadOnly(false)
  assert.equal(child.readOnly, false)
  assert.equal(child.runMutation(() => changed++), true)
  assert.equal(changed, 1)
})

test('active child cannot mutate or begin tasks while parent scope is staged', () => {
  const root = new InstanceScope({ staged: true })
  const child = new InstanceScope({ staged: false, parent: root })
  let data = { value: 1 }
  const context = child.createAuthority({
    readData: () => data,
    updateData(producer) { data = producer(data) },
    createId: prefix => prefix + '-id',
  })
  let calls = 0
  assert.throws(() => context.updateData(value => { calls++; return { ...value, value: 2 } }), /staged/)
  assert.throws(() => context.beginTask(), /staged/)
  assert.equal(calls, 0)
  root.activate()
  context.updateData(value => { calls++; return { ...value, value: 2 } })
  assert.equal(calls, 1)
  assert.equal(data.value, 2)
})

test('already issued child task cannot commit after parent health is revoked', () => {
  const root = new InstanceScope({ staged: false })
  let healthy = true
  root.configure({ health: () => healthy ? 'ready' : 'failed' })
  const child = new InstanceScope({ staged: false, parent: root })
  let writes = 0
  const context = child.createAuthority({
    readData: () => ({ value: 1 }),
    updateData(producer) { writes++; producer({ value: 1 }) },
    createId: prefix => prefix,
  })
  const task = context.beginTask()
  healthy = false
  let producerCalled = false
  assert.equal(task.commit(value => { producerCalled = true; return value }), false)
  assert.equal(producerCalled, false)
  assert.equal(task.signal.aborted, true)
  assert.equal(writes, 0)
})


test('child-specific read-only survives a parent read-only round trip', () => {
  const parent = new InstanceScope({ staged: false })
  const child = new InstanceScope({ staged: false, readOnly: true, parent })
  const grandchild = new InstanceScope({ staged: false, parent: child })
  let mutations = 0
  assert.equal(child.readOnly, true)
  assert.equal(grandchild.readOnly, true)
  parent.setReadOnly(true)
  parent.setReadOnly(false)
  assert.equal(child.readOnly, true, 'parent mode restored independent child mutation permission')
  assert.equal(grandchild.readOnly, true, 'parent mode restored independent grandchild permission')
  assert.equal(child.runMutation(() => mutations++), false)
  assert.equal(grandchild.runMutation(() => mutations++), false)
  assert.equal(mutations, 0)
  child.setReadOnly(false)
  assert.equal(child.readOnly, false)
  assert.equal(grandchild.readOnly, false)
  assert.equal(grandchild.runMutation(() => mutations++), true)
  assert.equal(mutations, 1)
})

test('a child cannot override a read-only ancestor by changing its local mode', () => {
  const parent = new InstanceScope({ staged: false, readOnly: true })
  const child = new InstanceScope({ staged: false, parent })
  child.setReadOnly(false)
  assert.equal(child.readOnly, true, 'child reported writable despite read-only parent')
  let mutations = 0
  assert.equal(child.runMutation(() => mutations++), false)
  assert.equal(mutations, 0)
  parent.setReadOnly(false)
  assert.equal(child.readOnly, false)
  assert.equal(child.runMutation(() => mutations++), true)
  assert.equal(mutations, 1)
})

test('configure(readOnly) immediately aborts active descendant tasks and cannot resurrect them', () => {
  const parent = new InstanceScope({ staged: false, generation: 1 })
  const child = new InstanceScope({ staged: false, generation: 1, parent })
  let data = { value: 1 }
  let producerCalls = 0
  const context = child.createAuthority({
    readData: () => data,
    updateData(producer) { producerCalls++; data = producer(data) },
  })
  const active = context.beginTask()
  parent.configure({ readOnly: true })
  assert.equal(parent.readOnly, true)
  assert.equal(child.readOnly, true)
  assert.equal(active.signal.aborted, true, 'configure did not revoke an in-flight child task')
  parent.configure({ readOnly: false })
  assert.equal(child.readOnly, false)
  assert.equal(active.commit(current => ({ ...current, value: 2 })), false)
  assert.equal(producerCalls, 0)
  const fresh = context.beginTask()
  assert.equal(fresh.commit(current => ({ ...current, value: 3 })), true)
  assert.equal(data.value, 3)
})


test('hierarchical read-only decisions match an independent oracle over 1200 mode updates', () => {
  const nodes = [
    new InstanceScope({ staged: false }),
  ]
  nodes.push(new InstanceScope({ staged: false, parent: nodes[0] }))
  nodes.push(new InstanceScope({ staged: false, parent: nodes[1] }))
  nodes.push(new InstanceScope({ staged: false, parent: nodes[0] }))
  const parents = [-1, 0, 1, 0]
  const local = [false, false, false, false]
  let seed = 0x62b2d801
  const random = size => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) % size
  }
  let operations = 0
  for (let step = 0; step < 1200; step++) {
    const target = random(nodes.length)
    const value = random(2) === 0
    local[target] = value
    if (step % 3 === 0) nodes[target].configure({ readOnly: value })
    else nodes[target].setReadOnly(value)
    for (let index = 0; index < nodes.length; index++) {
      let expected = false
      for (let ancestor = index; ancestor >= 0; ancestor = parents[ancestor]) {
        expected ||= local[ancestor]
      }
      assert.equal(nodes[index].readOnly, expected, 'wrong effective read-only at step ' + step + ', node ' + index)
      const before = operations
      assert.equal(nodes[index].runMutation(() => operations++), !expected,
        'mutation permission diverges from ancestor restrictions at step ' + step + ', node ' + index)
      assert.equal(operations, before + (expected ? 0 : 1))
    }
  }
})
test('beginTask cannot issue a live task after its admission callbacks revoke the scope', () => {
  for (const interruption of ['revoke', 'read-only', 'read-only-roundtrip', 'parent-revoke']) {
    const parent = new InstanceScope({ staged: false, generation: 3 })
    const scope = new InstanceScope({ staged: false, generation: 3, parent })
    let probes = 0
    scope.configure({
      health: () => 'ready',
      phase: () => 'idle',
      currentGeneration: () => 3,
      currentRevision() {
        probes++
        if (interruption === 'revoke') scope.revoke()
        else if (interruption === 'read-only') scope.setReadOnly(true)
        else if (interruption === 'read-only-roundtrip') {
          scope.setReadOnly(true)
          scope.setReadOnly(false)
        } else parent.revoke()
        return 7
      },
    })
    let writes = 0
    const context = scope.createAuthority({
      readData: () => ({ text: 'Original' }),
      updateData() { writes++ },
    })
    assert.throws(() => context.beginTask(),
      error => error?.name === 'AbortError',
      interruption + ' returned a task with authoring authority after revocation')
    assert.equal(probes, 1)
    assert.equal(writes, 0)
  }
})

test('callbacks that revoke a scope during a health or phase check cannot run producers', () => {
  for (const stage of ['health', 'phase', 'parent-health']) {
    const parent = new InstanceScope({ staged: false, generation: 1 })
    const scope = new InstanceScope({ staged: false, generation: 1, parent })
    let calls = 0
    const retire = () => {
      calls++
      if (stage === 'parent-health') parent.revoke()
      else scope.revoke()
    }
    scope.configure({
      health() {
        if (stage === 'health') retire()
        return 'ready'
      },
      phase() {
        if (stage === 'phase') retire()
        return 'idle'
      },
    })
    if (stage === 'parent-health') parent.configure({
      health() { retire(); return 'ready' },
    })
    let producers = 0
    const context = scope.createAuthority({
      readData: () => ({ value: 1 }),
      updateData(producer) { producers++; producer({ value: 1 }) },
    })
    assert.equal(scope.runMutation(() => { producers++ }), false,
      stage + ' let an invalid scope run a host mutation')
    context.updateData(() => { producers++; return { value: 2 } })
    assert.equal(producers, 0, stage + ' dispatched a retired producer')
    assert.equal(calls, 1)
  }
})

test('getData refuses a scope revoked by its health callback before reading author data', () => {
  const scope = new InstanceScope({ staged: false })
  let reads = 0
  scope.configure({ health() { scope.revoke(); return 'ready' } })
  const context = scope.createAuthority({
    readData() { reads++; return { text: 'private author data' } },
    updateData() {},
  })
  assert.throws(() => context.getData(), error => error?.name === 'AbortError')
  assert.equal(reads, 0, 'revoked scope exposed data after the health check')
})
test('a data task cannot commit after generation or phase callbacks revoke its owner', () => {
  for (const stage of ['generation', 'phase']) {
    const scope = new InstanceScope({ staged: false, generation: 2 })
    scope.configure({
      currentRevision: () => 3,
      currentGeneration: () => 2,
      health: () => 'ready',
      phase: () => 'idle',
    })
    let writes = 0
    const context = scope.createAuthority({
      readData: () => ({ value: 1 }),
      updateData(producer) { writes++; producer({ value: 1 }) },
    })
    const task = context.beginTask()
    const revoke = () => scope.revoke()
    scope.configure(stage === 'generation'
      ? { currentGeneration() { revoke(); return 2 } }
      : { phase() { revoke(); return 'idle' } })
    let producerCalls = 0
    assert.equal(task.commit(current => {
      producerCalls++
      return { ...current, value: 2 }
    }), false, stage + ' revoked the owner but task.commit still reported success')
    assert.equal(task.signal.aborted, true)
    assert.equal(writes, 0)
    assert.equal(producerCalls, 0)
  }
})

test('retired instance callbacks cannot return data or identifiers after revocation', () => {
  for (const operation of ['getData', 'createId']) {
    const scope = new InstanceScope({ staged: false })
    let callbackCalls = 0
    const context = scope.createAuthority({
      readData() {
        callbackCalls++
        scope.revoke()
        return { value: 'private' }
      },
      updateData() {},
      createId() {
        callbackCalls++
        scope.revoke()
        return 'generated-but-retired'
      },
    })
    assert.throws(
      () => operation === 'getData' ? context.getData() : context.createId('item'),
      error => error?.name === 'AbortError',
      operation + ' returned a value from an already revoked owner',
    )
    assert.equal(callbackCalls, 1)
  }
})
