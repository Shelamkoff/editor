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

test('schema default round trip accepts nested JSON object reordering', () => {
  const original = {
    a: 1,
    nested: { first: true, last: false },
    list: [{ id: 'a', value: 2 }, { id: 'b', value: 3 }],
  }
  const snapshot = snapshotDataSchema({
    currentVersion: 1,
    createDefault() { return original },
    encode(data) { return { dataVersion: 1, data } },
    decode(input) {
      const value = input.data
      return {
        dataVersion: 1,
        data: {
          list: value.list.map(item => ({ value: item.value, id: item.id })),
          nested: { last: value.nested.last, first: value.nested.first },
          a: value.a,
        },
      }
    },
  }, 'Probe')
  assert.deepEqual(snapshot.createDefault(), original)
  assert.deepEqual(snapshot.encode(snapshot.createDefault()).data, original)
})

test('schema default round trip must still reject changed array element order', () => {
  assert.throws(() => snapshotDataSchema({
    currentVersion: 1,
    createDefault() { return { items: [{ id: 'a' }, { id: 'b' }] } },
    encode(data) { return { dataVersion: 1, data } },
    decode(input) {
      return { dataVersion: 1, data: { items: [...input.data.items].reverse() } }
    },
  }, 'Probe'), /round-trip/)
})

test('schema default round trip must still reject a changed nested property', () => {
  assert.throws(() => snapshotDataSchema({
    currentVersion: 1,
    createDefault() { return { profile: { a: 1, b: 2 } } },
    encode(data) { return { dataVersion: 1, data } },
    decode() { return { dataVersion: 1, data: { profile: { a: 1, b: 3 } } } },
  }, 'Probe'), /round-trip/)
})


test('schema registration rejects invalid currentVersion without invoking method accessors', () => {
  const reads = []
  const invalid = {
    currentVersion: 0,
    get createDefault() { reads.push('default'); throw new Error('default getter executed') },
    get encode() { reads.push('encode'); throw new Error('encode getter executed') },
    get decode() { reads.push('decode'); throw new Error('decode getter executed') },
  }
  assert.throws(
    () => snapshotDataSchema(invalid, 'Probe'),
    /currentVersion must be a positive safe integer/,
  )
  assert.deepEqual(reads, [], 'invalid schema version evaluated callback methods')
})

test('schema rejects object-valued dataVersion without invoking its toString', () => {
  const target = schema()
  let coercions = 0
  const version = {
    toString() {
      coercions++
      throw new Error('untrusted version coercion executed')
    },
  }
  let payloadReads = 0
  const input = {
    dataVersion: version,
    get data() {
      payloadReads++
      throw new Error('unsupported payload was evaluated')
    },
  }
  assert.throws(() => target.decode(input), error => {
    assert.match(error.message, /Unsupported Probe data version/)
    assert.equal(documentValidationIssue(error)?.reason, 'unsupported-data-version')
    return true
  })
  assert.equal(coercions, 0)
  assert.equal(payloadReads, 0)
})


test('captured schema rejects asynchronously resolved rich-text transforms ignored by plugin mapper', async () => {
  const captured = snapshotDataSchema({
    currentVersion: 1,
    createDefault() { return { text: 'Original' } },
    encode(data) { return { dataVersion: 1, data } },
    decode(input) { return input },
    mapRichText(data, transform) {
      transform(data.text, 'text')
      return data
    },
  }, 'Probe', { richText: true })
  assert.throws(
    () => captured.mapRichText({ text: 'Original' }, () => Promise.resolve('late')),
    /must complete synchronously/,
  )
  await Promise.resolve()
})

test('captured schema rejects non-string rich-text transform return values', () => {
  const captured = snapshotDataSchema({
    currentVersion: 1,
    createDefault() { return { text: 'Original' } },
    encode(data) { return { dataVersion: 1, data } },
    decode(input) { return input },
    mapRichText(data, transform) {
      transform(data.text, 'text')
      return data
    },
  }, 'Probe', { richText: true })
  assert.throws(
    () => captured.mapRichText({ text: 'Original' }, () => ({ text: 'object' })),
    /Rich-text transform must return a string/,
  )
})


test('captured schema cannot swallow failed author rich-text transform validation', () => {
  const captured = snapshotDataSchema({
    currentVersion: 1,
    createDefault() { return { text: 'Original' } },
    encode(data) { return { dataVersion: 1, data } },
    decode(input) { return input },
    mapRichText(data, transform) {
      try { transform(data.text, 'text') } catch {}
      return data
    },
  }, 'Probe', { richText: true })
  assert.throws(
    () => captured.mapRichText({ text: 'Original' }, () => 55),
    /Rich-text transform must return a string/,
  )
})
