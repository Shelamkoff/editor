import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decodeCurrentBlock,
  decodeCurrentDocument,
  decodeCurrentInlineMap,
  snapshotCurrentDocumentEnvelope,
} from './DocumentSchema.js'
import { documentValidationIssue } from './documentValidationIssue.js'

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

test('own inline keys survive decoding for registered and unloaded payloads', () => {
  const input = JSON.parse('{"__proto__":{"type":"known","dataVersion":1,"data":{"value":"Own"}},"constructor":{"type":"unloaded","dataVersion":5,"data":{"label":"Opaque"}}}')
  const decoded = decodeCurrentInlineMap(input, { getInlineSchema: type => type === 'known' ? currentV1 : undefined })
  assert.deepEqual(decoded, input)
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype)
  decoded.__proto__.data.value = 'Changed'
  assert.equal(input.__proto__.data.value, 'Own')
})

test('shared failure metadata follows the boundary, including inline identity and primitive schema throws', () => {
  const run = (input, resolvers) => {
    try { decodeCurrentDocument(input, resolvers) } catch (error) { return error }
    assert.fail('Expected rejection')
  }
  const source = inline => ({ version: '2.0.0', blocks: [{ id: 'a', type: 'known', dataVersion: 2, data: { text: 'A' }, inline }] })
  const resolvers = { getBlockSchema: () => currentV2, getInlineSchema: () => currentV1 }
  const version = run(source({ x: { type: 'widget', dataVersion: 2, data: {} } }), resolvers)
  assert.ok(version instanceof RangeError)
  assert.deepEqual(documentValidationIssue(version), { reason: 'unsupported-data-version', blockId: 'a', inlineId: 'x', type: 'widget' })
  const malformed = run({ version: '2.0.0', blocks: [{ id: 'a', type: 'known', dataVersion: 0, data: {} }] }, resolvers)
  assert.ok(malformed instanceof TypeError)
  assert.equal(documentValidationIssue(malformed).reason, 'invalid-input')
  const invalid = run({ version: '2.0.0', blocks: [{ id: 'a', type: 'known', dataVersion: 2, data: {} }] }, {
    getBlockSchema: () => ({ ...currentV2, decode() { throw null } }),
  })
  assert.equal(invalid.cause, null)
  assert.deepEqual(documentValidationIssue(invalid), { reason: 'invalid-data', blockId: 'a', type: 'known' })
})

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

test('unsupported document field getter is never executed before rejection', () => {
  let reads = 0
  const input = {
    version: '2.0.0',
    blocks: [],
    get unsupportedDocumentField() {
      reads++
      throw new Error('unexpected document getter executed')
    },
  }
  assert.throws(() => snapshotCurrentDocumentEnvelope(input), /unsupported field "unsupportedDocumentField"/)
  assert.equal(reads, 0)
})

test('unsupported document version rejects before reading its block payload getter', () => {
  let reads = 0
  const input = {
    version: '1.0.0',
    get blocks() {
      reads++
      throw new Error('wrong-version document payload was read')
    },
  }
  assert.throws(() => snapshotCurrentDocumentEnvelope(input), error => {
    assert.match(error.message, /Unsupported document version/)
    assert.equal(documentValidationIssue(error)?.reason, 'unsupported-document-version')
    return true
  })
  assert.equal(reads, 0)
})

test('unsupported block metadata getters are not executed before shape rejection', () => {
  let reads = 0
  const input = {
    id: 'a',
    type: 'custom',
    dataVersion: 1,
    data: { value: 'ok' },
    get legacyField() {
      reads++
      throw new Error('unexpected block getter executed')
    },
  }
  assert.throws(() => decodeCurrentBlock(input), /unsupported field "legacyField"/)
  assert.equal(reads, 0)
})

test('invalid block identity rejects before inspecting unrelated payload getters', () => {
  let reads = 0
  const input = {
    id: '',
    type: 'custom',
    dataVersion: 1,
    get data() {
      reads++
      throw new Error('invalid block payload getter should not run')
    },
  }
  assert.throws(() => decodeCurrentBlock(input), /id must be a non-empty string/)
  assert.equal(reads, 0)
})

test('unsupported inline envelope fields are rejected without reading their getters', () => {
  let reads = 0
  const input = {
    mention: {
      type: 'mention', dataVersion: 1, data: { value: 'Valid' },
      get unsupportedField() {
        reads++
        throw new Error('unsupported inline metadata getter executed')
      },
    },
  }
  assert.throws(
    () => decodeCurrentInlineMap(input, { getInlineSchema: () => currentV1 }),
    /unsupported field "unsupportedField"/,
  )
  assert.equal(reads, 0, 'rejected inline metadata executed extension getter')
})

test('known block version is rejected before traversing getter-backed block payload', () => {
  let reads = 0
  const input = {
    id: 'block', type: 'known', dataVersion: 99,
    data: {
      get hidden() {
        reads++
        throw new Error('incorrectly inspected rejected block data')
      },
    },
  }
  assert.throws(() => decodeCurrentBlock(input, {
    getBlockSchema: () => currentV2,
  }), error => {
    assert.match(error.message, /Unsupported block "known" data version 99/)
    assert.deepEqual(documentValidationIssue(error), {
      reason: 'unsupported-data-version', blockId: 'block', type: 'known',
    })
    return true
  })
  assert.equal(reads, 0, 'wrong-version block traversed its private payload')
})

test('known inline widget version is rejected before inspecting getter-backed inline payload', () => {
  let reads = 0
  const input = {
    mention: {
      type: 'mention', dataVersion: 99,
      data: {
        get hidden() {
          reads++
          throw new Error('incorrectly inspected rejected inline payload')
        },
      },
    },
  }
  assert.throws(() => decodeCurrentInlineMap(input, {
    getInlineSchema: () => currentV1,
  }), error => {
    assert.match(error.message, /Unsupported inline widget "mention" data version 99/)
    assert.deepEqual(documentValidationIssue(error), {
      reason: 'unsupported-data-version', inlineId: 'mention', type: 'mention',
    })
    return true
  })
  assert.equal(reads, 0, 'wrong-version inline widget traversed its private payload')
})

test('first invalid inline occurrence rejects without reading any later occurrence getters', () => {
  let reads = 0
  const input = {
    first: { type: 'mention', dataVersion: 99, data: {} },
    get second() {
      reads++
      throw new Error('later inline entry was read before first failure')
    },
  }
  assert.throws(() => decodeCurrentInlineMap(input, {
    getInlineSchema: () => currentV1,
  }), /Unsupported inline widget "mention" data version 99/)
  assert.equal(reads, 0, 'decoder eagerly cloned unrelated following inline entries')
})

test('inline occurrence metadata is captured once and detached from its original data', () => {
  const reads = { type: 0, dataVersion: 0, data: 0 }
  const original = { value: 'Initial' }
  const input = {
    mention: {
      get type() { reads.type++; return 'mention' },
      get dataVersion() { reads.dataVersion++; return 1 },
      get data() { reads.data++; return original },
    },
  }
  const decoded = decodeCurrentInlineMap(input, { getInlineSchema: () => currentV1 })
  assert.deepEqual(decoded, {
    mention: { type: 'mention', dataVersion: 1, data: { value: 'Initial' } },
  })
  assert.deepEqual(reads, { type: 1, dataVersion: 1, data: 1 })
  original.value = 'Mutated'
  assert.equal(decoded.mention.data.value, 'Initial')
})

test('inline map still rejects an enumerable symbol key without reading its getter', () => {
  let reads = 0
  const input = { mention: { type: 'mention', dataVersion: 1, data: { value: 'A' } } }
  Object.defineProperty(input, Symbol('hidden'), {
    enumerable: true,
    get() {
      reads++
      throw new Error('symbol getter must not execute')
    },
  })
  assert.throws(() => decodeCurrentInlineMap(input), /symbol key/)
  assert.equal(reads, 0)
})
