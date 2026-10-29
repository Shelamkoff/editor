import test from 'node:test'
import assert from 'node:assert/strict'
import { InstanceScope } from './InstanceScope.js'

// Scope-only fixtures supply preparation explicitly; runtime tests verify its guard.
const prepareValue = operation => operation()

test('DataTask captures the revision at acquisition and forwards a one-shot field continuation', () => {
  let revision = 7
  let data = { url: 'https://example.test/new', title: '' }
  const operations = []
  const scope = new InstanceScope({ staged: false, generation: 1 })
  scope.configure({
    currentGeneration: () => 1,
    currentRevision: () => revision,
    health: () => 'ready',
    phase: () => 'idle',
  })
  const context = scope.createAuthority({
    prepareValue,
    readData: () => data,
    updateData(producer, options) {
      operations.push(options)
      data = producer(data)
    },
  })
  const task = context.beginTask()
  revision = 8 // another unrelated action happened while metadata was loading
  assert.equal(task.commit(current => ({ ...current, title: 'Fetched' }), {
    mergeWithPreviousField: 'url',
  }), true)
  assert.equal(data.title, 'Fetched')
  assert.deepEqual(operations, [{
    historyContinuation: { baseRevision: 7, fieldKey: 'url' },
  }])
  assert.equal(task.commit(() => { throw new Error('Task reused') }), false)
  scope.revoke()
})

test('DataTask without an explicit history continuation preserves ordinary updates', () => {
  const scope = new InstanceScope({ staged: false, generation: 1 })
  const updates = []
  scope.configure({ currentGeneration: () => 1, currentRevision: () => 3 })
  const context = scope.createAuthority({
    prepareValue,
    readData: () => ({ value: 1 }),
    updateData(producer, options) {
      updates.push(options)
      assert.deepEqual(producer({ value: 1 }), { value: 2 })
    },
  })
  assert.equal(context.beginTask().commit(current => ({ ...current, value: 2 })), true)
  assert.deepEqual(updates, [undefined])
  scope.revoke()
})

test('revoked or invalid DataTask continuation cannot authorize a mutation', () => {
  const scope = new InstanceScope({ staged: false, generation: 1 })
  scope.configure({ currentGeneration: () => 1, currentRevision: () => 3 })
  let writes = 0
  const context = scope.createAuthority({
    prepareValue,
    readData: () => ({ url: 'https://example.test/new' }),
    updateData() { writes++ },
  })
  const invalid = context.beginTask()
  assert.throws(() => invalid.commit(x => x, { mergeWithPreviousField: '' }), TypeError)
  assert.equal(writes, 0)
  invalid.cancel()
  const retired = context.beginTask()
  scope.setReadOnly(true)
  assert.equal(retired.signal.aborted, true)
  assert.equal(retired.commit(x => x, { mergeWithPreviousField: 'url' }), false)
  assert.equal(writes, 0)
  scope.revoke()
})
