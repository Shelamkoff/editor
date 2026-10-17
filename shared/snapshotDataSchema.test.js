import test from 'node:test'
import assert from 'node:assert/strict'
import { snapshotDataSchema } from './snapshotDataSchema.js'
import { documentValidationIssue } from './documentValidationIssue.js'

function schema() {
  return snapshotDataSchema({
    currentVersion: 1,
    createDefault() { return { value: '' } },
    encode(data) {
      return { dataVersion: 1, data: { value: data.value } }
    },
    decode(input) {
      return { dataVersion: 1, data: { value: input.data.value } }
    },
  }, 'Probe')
}

test('schema decode reads declared envelope fields only, never unrelated getters', () => {
  const target = schema()
  const input = {
    dataVersion: 1,
    data: { value: 'accepted' },
    get unusedExtensionField() { throw new Error('unrelated getter executed') },
  }
  assert.deepEqual(target.decode(input), { dataVersion: 1, data: { value: 'accepted' } })
})

test('schema decode refuses unsupported version before touching its payload getter', () => {
  const target = schema()
  let reads = 0
  const input = {
    dataVersion: 2,
    get data() {
      reads++
      throw new Error('wrong-version payload was read')
    },
  }
  assert.throws(() => target.decode(input), error => {
    assert.match(error.message, /Unsupported Probe data version 2/)
    assert.equal(documentValidationIssue(error)?.reason, 'unsupported-data-version')
    return true
  })
  assert.equal(reads, 0)
})

test('schema decode snapshots dataVersion and data accessors once', () => {
  const target = schema()
  const reads = []
  const input = {
    get dataVersion() { reads.push('version'); return 1 },
    get data() { reads.push('data'); return { value: 'stable' } },
  }
  assert.deepEqual(target.decode(input), { dataVersion: 1, data: { value: 'stable' } })
  assert.deepEqual(reads, ['version', 'data'])
})

test('schema decode never observes symbol getters or inherited extension metadata', () => {
  const target = schema()
  const prototype = {
    get external() { throw new Error('prototype getter executed') },
  }
  const input = Object.assign(Object.create(prototype), {
    dataVersion: 1,
    data: { value: 'ok' },
  })
  Object.defineProperty(input, Symbol('private'), {
    enumerable: true,
    get() { throw new Error('unrelated symbol getter executed') },
  })
  assert.deepEqual(target.decode(input), { dataVersion: 1, data: { value: 'ok' } })
})
