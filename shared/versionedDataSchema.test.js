import test from 'node:test'
import assert from 'node:assert/strict'

import { createVersionedDataSchema } from './versionedDataSchema.js'

function createSchema(overrides = {}) {
  return createVersionedDataSchema({
    currentVersion: 2,
    createDefault: () => ({ text: '' }),
    normalize: input => ({
      text: typeof input?.text === 'string' ? input.text.trim() : '',
    }),
    ...overrides,
  })
}

test('versioned data schema creates detached canonical defaults and encodes current local data', () => {
  const schema = createSchema()
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

test('versioned data schema decodes only the explicit current version', () => {
  const schema = createSchema()

  assert.deepEqual(schema.decode({
    dataVersion: 2,
    data: { text: ' body ' },
  }), {
    dataVersion: 2,
    data: { text: 'body' },
  })

  assert.throws(
    () => schema.decode({ data: { text: 'body' } }),
    /dataVersion is required/,
  )
  assert.throws(
    () => schema.decode({ dataVersion: 1, data: { text: 'body' } }),
    /Unsupported data version 1; current version is 2/,
  )
  assert.throws(
    () => schema.decode({ dataVersion: 3, data: { text: 'body' } }),
    /Unsupported data version 3; current version is 2/,
  )
})

test('versioned data schema rejects removed compatibility options', () => {
  assert.throws(
    () => createVersionedDataSchema({
      currentVersion: 2,
      legacyVersion: 1,
      createDefault: () => ({}),
      normalize: input => input,
    }),
    /Unknown versioned data schema option: legacyVersion/,
  )

  assert.throws(
    () => createVersionedDataSchema({
      currentVersion: 2,
      migrations: [],
      createDefault: () => ({}),
      normalize: input => input,
    }),
    /Unknown versioned data schema option: migrations/,
  )
})

test('versioned data schema isolates decode input and normalized output from caller-owned values', () => {
  const source = { nested: { value: 'before' } }
  const schema = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => ({ nested: { value: '' } }),
    normalize(input) {
      input.nested.value = String(input.nested.value)
      return input
    },
  })

  const decoded = schema.decode({ dataVersion: 1, data: source })
  assert.deepEqual(source, { nested: { value: 'before' } })
  assert.deepEqual(decoded.data, { nested: { value: 'before' } })

  decoded.data.nested.value = 'consumer mutation'
  assert.deepEqual(source, { nested: { value: 'before' } })
})

test('versioned data schema rejects non-JSON defaults, inputs and normalized outputs', () => {
  const invalidDefault = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => ({ value: undefined }),
    normalize: input => input,
  })
  assert.throws(() => invalidDefault.createDefault(), /non-JSON undefined value/)

  const schema = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => ({}),
    normalize: input => input,
  })
  assert.throws(
    () => schema.decode({ dataVersion: 1, data: { value: Number.POSITIVE_INFINITY } }),
    /finite JSON number/,
  )
})

test('versioned data schema snapshots accessor-backed options and serialized envelope members once', () => {
  const reads = { currentVersion: 0, createDefault: 0, normalize: 0, dataVersion: 0, data: 0 }
  const options = {
    get currentVersion() { reads.currentVersion++; return 1 },
    get createDefault() { reads.createDefault++; return () => ({ text: '' }) },
    get normalize() { reads.normalize++; return input => ({ text: String(input.text ?? '') }) },
  }
  const schema = createVersionedDataSchema(options)

  const input = {
    get dataVersion() { reads.dataVersion++; return 1 },
    get data() { reads.data++; return { text: 'owned' } },
  }
  assert.deepEqual(schema.decode(input), { dataVersion: 1, data: { text: 'owned' } })
  assert.deepEqual(reads, { currentVersion: 1, createDefault: 1, normalize: 1, dataVersion: 1, data: 1 })
})


test('versioned schema rejects missing and unsupported versions before reading author payload', () => {
  const schema = createSchema()
  for (const [version, message] of [[undefined, /dataVersion is required/], [1, /Unsupported data version 1/]]) {
    let payloadReads = 0
    const input = {
      ...(version === undefined ? {} : { dataVersion: version }),
      get data() {
        payloadReads++
        throw new Error('version-rejected payload was evaluated')
      },
    }
    assert.throws(() => schema.decode(input), message)
    assert.equal(payloadReads, 0, 'an invalid version must not inspect its payload')
  }
})

test('versioned schema reads only declared decode fields, not unrelated extension getters', () => {
  const schema = createSchema()
  let extraReads = 0
  const input = {
    dataVersion: 2,
    data: { text: ' accepted ' },
    get unrelatedPluginProperty() {
      extraReads++
      throw new Error('unrelated extension getter executed')
    },
  }
  assert.deepEqual(schema.decode(input), {
    dataVersion: 2, data: { text: 'accepted' },
  })
  assert.equal(extraReads, 0)
})

test('versioned schema rejects unknown option names before invoking their accessors', () => {
  let reads = 0
  const options = {
    currentVersion: 1,
    createDefault: () => ({}),
    normalize: input => input,
    get migrations() {
      reads++
      throw new Error('removed compatibility getter executed')
    },
  }
  assert.throws(() => createVersionedDataSchema(options), /Unknown versioned data schema option: migrations/)
  assert.equal(reads, 0)
})

test('versioned schema does not inspect undeclared option symbol getters', () => {
  let reads = 0
  const options = {
    currentVersion: 1,
    createDefault: () => ({ text: '' }),
    normalize: input => input,
  }
  Object.defineProperty(options, Symbol('extension-metadata'), {
    enumerable: true,
    get() {
      reads++
      throw new Error('option symbol getter executed')
    },
  })
  const schema = createVersionedDataSchema(options)
  assert.deepEqual(schema.createDefault(), { text: '' })
  assert.equal(reads, 0)
})


test('versioned schema rejects asynchronous default producers through its synchronous contract', () => {
  const schema = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => Promise.resolve({ text: 'late' }),
    normalize: input => input,
  })
  assert.throws(() => schema.createDefault(), /must complete synchronously/)
})

test('versioned schema rejects asynchronous normalizers through its synchronous contract', () => {
  const schema = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => ({ text: '' }),
    normalize: () => Promise.resolve({ text: 'late' }),
  })
  assert.throws(() => schema.encode({ text: 'initial' }), /must complete synchronously/)
})

test('versioned schema does not silently accept asynchronous rich-text mappers', () => {
  const schema = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => ({ text: '' }),
    normalize: input => input,
    mapRichText: () => Promise.resolve(),
  })
  assert.throws(
    () => schema.mapRichText({ text: 'initial' }, text => text.toUpperCase()),
    /must complete synchronously/,
  )
})


test('versioned schema rejects a Promise returned by a rich-text transform even when its mapper ignores the value', async () => {
  const schema = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => ({ text: '' }),
    normalize: input => ({ text: input.text }),
    mapRichText(data, transform) {
      // A plugin mapper may call the supplied transform only for its effects.
      transform(data.text, 'text')
    },
  })
  assert.throws(
    () => schema.mapRichText({ text: 'Original' }, () => Promise.resolve('late')),
    /must complete synchronously/,
  )
  await Promise.resolve()
})

test('versioned schema rejects non-string rich-text transform values before accepting data', () => {
  const schema = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => ({ text: '' }),
    normalize: input => ({ text: input.text }),
    mapRichText(data, transform) {
      transform(data.text, 'text')
    },
  })
  assert.throws(
    () => schema.mapRichText({ text: 'Original' }, () => 42),
    /Rich-text transform must return a string/,
  )
})
