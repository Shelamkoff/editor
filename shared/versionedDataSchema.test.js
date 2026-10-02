import test from 'node:test'
import assert from 'node:assert/strict'

import { createVersionedDataSchema } from './versionedDataSchema.js'

test('versioned data schema creates detached canonical defaults and encodes current data', () => {
  const schema = createVersionedDataSchema({
    currentVersion: 2,
    legacyVersion: 1,
    createDefault: () => ({ text: '' }),
    normalize: input => ({
      text: typeof input?.text === 'string' ? input.text.trim() : '',
    }),
    migrations: [
      {
        from: 1,
        to: 2,
        migrate: input => ({ text: typeof input?.text === 'string' ? input.text : '' }),
      },
    ],
  })

  const first = schema.createDefault()
  const second = schema.createDefault()
  assert.deepEqual(first, { text: '' })
  assert.deepEqual(second, { text: '' })
  assert.notStrictEqual(first, second)

  first.text = 'changed'
  assert.deepEqual(second, { text: '' })

  const source = { text: ' body ' }
  const encoded = schema.encode(source)
  assert.deepEqual(encoded, {
    dataVersion: 2,
    data: { text: 'body' },
  })
  assert.notStrictEqual(encoded.data, source)
  assert.deepEqual(source, { text: ' body ' })
})

test('versioned data schema treats missing dataVersion as legacyVersion and follows one deterministic chain', () => {
  const calls = []
  const schema = createVersionedDataSchema({
    currentVersion: 3,
    legacyVersion: 1,
    createDefault: () => ({ value: '' }),
    normalize: input => ({ value: String(input?.value ?? '') }),
    migrations: [
      {
        from: 1,
        to: 2,
        migrate(input) {
          calls.push('1->2')
          return { value: `${input.value}:2` }
        },
      },
      {
        from: 2,
        to: 3,
        migrate(input) {
          calls.push('2->3')
          return { value: `${input.value}:3` }
        },
      },
    ],
  })

  assert.deepEqual(schema.decode({ data: { value: 'v' } }), {
    dataVersion: 3,
    data: { value: 'v:2:3' },
  })
  assert.deepEqual(calls, ['1->2', '2->3'])

  calls.length = 0
  assert.deepEqual(schema.decode({ dataVersion: undefined, data: { value: 'v' } }), {
    dataVersion: 3,
    data: { value: 'v:2:3' },
  })
  assert.deepEqual(calls, ['1->2', '2->3'])
})

test('versioned data schema isolates migration input and output from caller-owned values', () => {
  const source = { nested: { value: 'before' } }
  const schema = createVersionedDataSchema({
    currentVersion: 2,
    legacyVersion: 1,
    createDefault: () => ({ nested: { value: '' } }),
    normalize: input => ({ nested: { value: String(input?.nested?.value ?? '') } }),
    migrations: [{
      from: 1,
      to: 2,
      migrate(input) {
        input.nested.value = 'migrated'
        return input
      },
    }],
  })

  const decoded = schema.decode({ data: source })
  assert.deepEqual(source, { nested: { value: 'before' } })
  assert.deepEqual(decoded.data, { nested: { value: 'migrated' } })

  decoded.data.nested.value = 'consumer mutation'
  assert.deepEqual(source, { nested: { value: 'before' } })
})

test('versioned data schema rejects future versions, incomplete chains and invalid migration graphs', () => {
  const base = {
    currentVersion: 3,
    legacyVersion: 1,
    createDefault: () => ({}),
    normalize: () => ({}),
  }

  const incomplete = createVersionedDataSchema({
    ...base,
    migrations: [{ from: 1, to: 2, migrate: input => input }],
  })
  assert.throws(
    () => incomplete.decode({ dataVersion: 1, data: {} }),
    /No data migration from version 2 to 3/,
  )
  assert.throws(
    () => incomplete.decode({ dataVersion: 4, data: {} }),
    /Unsupported future data version 4/,
  )

  assert.throws(
    () => createVersionedDataSchema({
      ...base,
      migrations: [
        { from: 1, to: 2, migrate: input => input },
        { from: 1, to: 3, migrate: input => input },
      ],
    }),
    /Duplicate data migration source version 1/,
  )

  assert.throws(
    () => createVersionedDataSchema({
      ...base,
      migrations: [{ from: 2, to: 1, migrate: input => input }],
    }),
    /must advance to a greater version/,
  )
})

test('versioned data schema rejects non-JSON defaults, inputs and normalized outputs', () => {
  const invalidDefault = createVersionedDataSchema({
    currentVersion: 1,
    legacyVersion: 1,
    createDefault: () => ({ value: undefined }),
    normalize: input => input,
  })
  assert.throws(() => invalidDefault.createDefault(), /non-JSON undefined value/)

  const schema = createVersionedDataSchema({
    currentVersion: 1,
    legacyVersion: 1,
    createDefault: () => ({}),
    normalize: input => input,
  })
  assert.throws(
    () => schema.decode({ data: { value: Number.POSITIVE_INFINITY } }),
    /finite JSON number/,
  )
})
