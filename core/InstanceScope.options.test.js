import test from 'node:test'
import assert from 'node:assert/strict'
import { InstanceScope } from './InstanceScope.js'

function fixture() {
  let phase = 'idle'
  const flags = { health: 'ready', generation: 1, onHealth: null, onPhase: null }
  const scope = new InstanceScope({ generation: 1 })
  scope.configure({ currentGeneration: () => flags.generation, currentRevision: () => 3,
    health() { flags.onHealth?.(); return flags.health },
    phase() { flags.onPhase?.(); return phase },
  })
  let data = { value: 1 }, updates = 0
  const prepareValue = operation => {
    const previous = phase
    phase = 'extension-preparation'
    try { return operation() } finally { phase = previous }
  }
  const context = scope.createAuthority({ prepareValue, readData: () => data,
    updateData(producer) { data = producer(data); updates++ },
  })
  return { scope, context, flags, data: () => data, updates: () => updates,
    withPhase(value, operation) { const previous = phase; phase = value; try { return operation() } finally { phase = previous } },
  }
}

test('a closed task rejects before reading caller options', () => {
  const h = fixture()
  const task = h.context.beginTask()
  task.cancel()
  let reads = 0, producers = 0
  assert.equal(task.commit(() => { producers++; return {} }, {
    get mergeWithPreviousField() { reads++; throw new Error('Rejected getter ran') },
  }), false)
  assert.equal(reads, 0)
  assert.equal(producers, 0)
})

test('a task reserves its invocation before callback-capable admission', () => {
  const h = fixture()
  const task = h.context.beginTask()
  let reentered = false, innerReads = 0, innerProducers = 0, outerProducers = 0
  h.flags.onHealth = () => {
    if (reentered) return
    reentered = true
    assert.equal(task.commit(() => { innerProducers++; return { value: 9 } }, {
      get mergeWithPreviousField() { innerReads++; return undefined },
    }), false)
  }
  assert.equal(task.commit(() => { outerProducers++; return { value: 2 } }), true)
  assert.equal(innerReads, 0)
  assert.equal(innerProducers, 0)
  assert.equal(outerProducers, 1)
  assert.deepEqual(h.data(), { value: 2 })
})

test('task option getters run inside value preparation before the admitted producer', () => {
  const h = fixture()
  const task = h.context.beginTask()
  let optionReads = 0, nestedProducers = 0, producers = 0
  assert.equal(task.commit(current => { producers++; return { value: current.value + 1 } }, {
    get mergeWithPreviousField() {
      optionReads++
      assert.throws(() => h.context.updateData(() => { nestedProducers++; return { value: 9 } }), /prepar/)
      assert.throws(() => h.context.beginTask(), /prepar/)
      assert.deepEqual(h.context.getData(), { value: 1 })
      return 'value'
    },
  }), true)
  assert.equal(optionReads, 1)
  assert.equal(nestedProducers, 0)
  assert.equal(producers, 1)
  assert.equal(h.updates(), 1)
  assert.deepEqual(h.data(), { value: 2 })
})

for (const [name, retire] of [
  ['cancelled', (h, task) => task.cancel()],
  ['consumed', (h, task) => task.commit(current => current)],
  ['revoked', h => h.scope.revoke()],
  ['read-only', h => h.scope.setReadOnly(true)],
  ['mode round-trip', h => { h.scope.setReadOnly(true); h.scope.setReadOnly(false) }],
  ['stale generation', h => { h.flags.generation++ }],
  ['failed runtime', h => { h.flags.health = 'failed' }],
]) {
  test(`${name} tasks reject without reading any option or invoking a producer`, () => {
    const h = fixture(), task = h.context.beginTask()
    retire(h, task)
    let reads = 0, producers = 0
    assert.equal(task.commit(() => { producers++; return {} }, {
      get mergeWithPreviousField() { reads++; throw new Error('rejected input') },
    }), false)
    assert.equal(reads, 0)
    assert.equal(producers, 0)
  })
}

test('preparation-phase admission is retryable without observing options', () => {
  const h = fixture(), task = h.context.beginTask()
  let reads = 0, producers = 0
  const options = { get mergeWithPreviousField() { reads++; return 'value' } }
  const producer = current => { producers++; return current }
  h.withPhase('preparing-projection', () => assert.throws(() => task.commit(producer, options), /phase/))
  assert.equal(reads, 0)
  assert.equal(producers, 0)
  assert.equal(task.signal.aborted, false)
  assert.equal(task.commit(producer, options), true)
  assert.equal(reads, 1)
  assert.equal(producers, 1)
})

test('invalid or throwing option capture leaves the original task retryable', () => {
  const h = fixture(), task = h.context.beginTask()
  let producers = 0
  const producer = current => { producers++; return current }
  for (const value of ['', null, 1, {}, 'x'.repeat(129)]) {
    assert.throws(() => task.commit(producer, { mergeWithPreviousField: value }), /continuation field/)
    assert.equal(task.signal.aborted, false)
  }
  const failure = new Error('option failed')
  assert.throws(() => task.commit(producer, { get mergeWithPreviousField() { throw failure } }), error => error === failure)
  assert.equal(producers, 0)
  assert.equal(task.commit(producer, { mergeWithPreviousField: 'value' }), true)
  assert.equal(producers, 1)
  assert.equal(task.commit(producer), false)
})

for (const action of ['cancel', 'revoke', 'generation', 'mode']) {
  test(`option capture ${action} cancels publication before the producer`, () => {
    const h = fixture(), task = h.context.beginTask()
    let reads = 0, producers = 0
    assert.equal(task.commit(() => { producers++; return {} }, {
      get mergeWithPreviousField() {
        reads++
        if (action === 'cancel') task.cancel()
        else if (action === 'revoke') h.scope.revoke()
        else if (action === 'generation') h.flags.generation++
        else { h.scope.setReadOnly(true); h.scope.setReadOnly(false) }
        return 'value'
      },
    }), false)
    assert.equal(reads, 1)
    assert.equal(producers, 0)
    assert.equal(h.updates(), 0)
    assert.equal(task.signal.aborted, true)
    assert.equal(task.commit(() => ({})), false)
  })
}

test('getter cancellation plus an exception retains the exception and cannot revive the task', () => {
  const h = fixture(), task = h.context.beginTask()
  const failure = new Error('cancelled getter failed')
  assert.throws(() => task.commit(() => ({}), {
    get mergeWithPreviousField() { task.cancel(); throw failure },
  }), error => error === failure)
  assert.equal(task.signal.aborted, true)
  assert.equal(task.commit(() => ({})), false)
  assert.equal(h.updates(), 0)
})

test('a recursive option getter cannot dispatch, and unrelated option properties are never read', () => {
  const h = fixture(), task = h.context.beginTask()
  let reads = 0, nestedReads = 0, producers = 0
  const options = Object.create({
    get mergeWithPreviousField() {
      reads++
      assert.equal(task.commit(() => { throw new Error('nested producer') }, {
        get mergeWithPreviousField() { nestedReads++; throw new Error('nested getter') },
      }), false)
      return 'value'
    },
  })
  Object.defineProperty(options, 'unrelated', { enumerable: true, get() { throw new Error('irrelevant option') } })
  assert.equal(task.commit(current => { producers++; return current }, options), true)
  assert.equal(reads, 1)
  assert.equal(nestedReads, 0)
  assert.equal(producers, 1)
})

test('an entered producer failure consumes the task instead of reopening admission', () => {
  const h = fixture(), task = h.context.beginTask()
  const failure = new Error('producer failed')
  assert.throws(() => task.commit(() => { throw failure }), error => error === failure)
  assert.equal(task.signal.aborted, true)
  assert.equal(task.commit(() => ({}), { get mergeWithPreviousField() { throw new Error('retry options') } }), false)
  assert.equal(h.updates(), 0)
})

test('repeated cancellation does not change a completed task or its canonical result', () => {
  const h = fixture(), task = h.context.beginTask()
  assert.equal(task.commit(() => ({ value: 2 })), true)
  task.cancel()
  task.cancel()
  assert.equal(task.signal.aborted, false)
  assert.deepEqual(h.data(), { value: 2 })
  assert.equal(h.updates(), 1)
})
