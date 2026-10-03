import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decodeCurrentBlock,
  decodeCurrentDocument,
  decodeCurrentInlineMap,
  snapshotCurrentDocumentEnvelope,
} from './DocumentSchema.js'

const currentV1 = {
  currentVersion: 1,
  createDefault: () => ({ value: '' }),
  decode({ dataVersion, data }) {
    assert.equal(dataVersion, 1)
    return { dataVersion: 1, data: { value: String(data.value ?? '') } }
  },
  encode(data) { return { dataVersion: 1, data: { value: String(data.value ?? '') } } },
}

const currentV2 = {
  currentVersion: 2,
  createDefault: () => ({ text: '' }),
  decode({ dataVersion, data }) {
    assert.equal(dataVersion, 2)
    return { dataVersion: 2, data: { text: String(data.text ?? '') } }
  },
  encode(data) { return { dataVersion: 2, data: { text: String(data.text ?? '') } } },
}

test('current document boundary requires the exact envelope and record metadata', () => {
  const valid = {
    version: '2.0.0',
    blocks: [{ id: 'a', type: 'known', dataVersion: 2, data: { text: 'A' } }],
  }
  assert.deepEqual(snapshotCurrentDocumentEnvelope(valid), valid)

  for (const input of [
    { blocks: [] },
    { version: '1.0.0', blocks: [] },
    { version: '99.0.0', blocks: [] },
  ]) {
    assert.throws(
      () => snapshotCurrentDocumentEnvelope(input),
      input.version === undefined ? TypeError : RangeError,
    )
  }

  assert.throws(
    () => snapshotCurrentDocumentEnvelope({
      version: '2.0.0',
      blocks: [{ type: 'known', dataVersion: 2, data: {} }],
    }),
    /id must be a non-empty string/,
  )
  assert.throws(
    () => snapshotCurrentDocumentEnvelope({
      version: '2.0.0',
      blocks: [{ id: 'a', type: 'known', data: {} }],
    }),
    /dataVersion is required/,
  )
  assert.throws(
    () => snapshotCurrentDocumentEnvelope({
      version: '2.0.0',
      blocks: [
        { id: 'same', type: 'known', dataVersion: 2, data: {} },
        { id: 'same', type: 'known', dataVersion: 2, data: {} },
      ],
    }),
    /Duplicate block id/,
  )
})

test('known block versions are exact while currentVersion 1 remains valid', () => {
  let v2DecodeCalls = 0
  const trackedV2 = {
    ...currentV2,
    decode(input) {
      v2DecodeCalls++
      return currentV2.decode(input)
    },
  }
  const resolvers = {
    getBlockSchema(type) {
      return type === 'v1' ? currentV1 : type === 'v2' ? trackedV2 : undefined
    },
  }

  assert.deepEqual(
    decodeCurrentBlock({ id: 'one', type: 'v1', dataVersion: 1, data: { value: 'ok' } }, resolvers).data,
    { value: 'ok' },
  )
  assert.throws(
    () => decodeCurrentBlock({ id: 'two', type: 'v2', dataVersion: 1, data: { text: 'old' } }, resolvers),
    /Unsupported block "v2" data version 1/,
  )
  assert.equal(v2DecodeCalls, 0, 'version mismatch must be rejected before schema callbacks')
})

test('unregistered current types stay inert and owned', () => {
  const source = {
    version: '2.0.0',
    blocks: [{
      id: 'opaque',
      type: 'extension-not-installed',
      dataVersion: 7,
      data: { nested: { value: 1 } },
    }],
  }
  const decoded = decodeCurrentDocument(source)
  assert.deepEqual(decoded, source)
  assert.notStrictEqual(decoded.blocks[0].data, source.blocks[0].data)
  decoded.blocks[0].data.nested.value = 2
  assert.equal(source.blocks[0].data.nested.value, 1)
})

test('known and unknown inline widgets use the same exact current boundary', () => {
  const input = {
    known: { type: 'mention', dataVersion: 1, data: { value: 'A' } },
    opaque: { type: 'future-inline', dataVersion: 4, data: { value: 'B' } },
  }
  const decoded = decodeCurrentInlineMap(input, {
    getInlineSchema: type => type === 'mention' ? currentV1 : undefined,
  })
  assert.deepEqual(decoded, input)

  assert.throws(
    () => decodeCurrentInlineMap({
      known: { type: 'mention', dataVersion: 2, data: { value: 'old' } },
    }, { getInlineSchema: () => currentV1 }),
    /Unsupported inline widget "mention" data version 2/,
  )
})

test('unsupported envelope fields and late invalid records are rejected before a decoded document is returned', () => {
  assert.throws(
    () => decodeCurrentDocument({ version: '2.0.0', blocks: [], legacy: true }),
    /unsupported field "legacy"/,
  )

  let calls = 0
  const schema = {
    ...currentV2,
    decode(input) {
      calls++
      if (input.data.bad) throw new TypeError('bad data')
      return currentV2.decode(input)
    },
  }
  assert.throws(
    () => decodeCurrentDocument({
      version: '2.0.0',
      blocks: [
        { id: 'a', type: 'known', dataVersion: 2, data: { text: 'A' } },
        { id: 'b', type: 'known', dataVersion: 2, data: { bad: true } },
      ],
    }, { getBlockSchema: () => schema }),
    /bad data/,
  )
  assert.equal(calls, 2)
})

test('document boundary observes top-level and block accessors once', () => {
  const reads = { version: 0, blocks: 0, data: 0 }
  const block = {
    id: 'a',
    type: 'known',
    dataVersion: 2,
    get data() { reads.data++; return { text: 'A' } },
  }
  const document = {
    get version() { reads.version++; return '2.0.0' },
    get blocks() { reads.blocks++; return [block] },
  }
  const snapshot = snapshotCurrentDocumentEnvelope(document)
  assert.equal(snapshot.blocks[0].data.text, 'A')
  assert.deepEqual(reads, { version: 1, blocks: 1, data: 1 })
})
