import test from 'node:test'
import assert from 'node:assert/strict'
import { materializeClipboardRichText, materializeClipboardBlock } from './ClipboardPlans.js'

function harness(conversions) {
  const ownerDocument = Object.freeze({ id: 'editor-owning-document' })
  let allocated = 0
  const types = Object.keys(conversions)
  const definitions = Object.fromEntries(types.map(type => [
    type, { type, capabilities: { conversion: conversions[type] } },
  ]))
  const services = {
    ownerDocument,
    defaultBlockType: types[0],
    blockTypes: types,
    getBlockDefinition: type => definitions[type],
    normalizeExternalInline: inline => inline,
    allocateId(type, reserved) {
      const id = type + '-' + ++allocated
      reserved.add(id)
      return id
    },
    recordFromData: (id, type, _definition, data, _tunes, inline) =>
      ({ id, type, data, inline }),
    assertConversionInlinePreserved() {},
  }
  return { services, ownerDocument, allocated: () => allocated }
}

test('rich-text clipboard imports receive an isolated payload and the owning document', () => {
  const source = { kind: 'rich-text', data: { text: 'A<b>B</b>' } }
  let imports = 0
  const harnessed = harness({
    paragraph: {
      canImport(payload) {
        payload.data.text = 'MUTATED BY REJECTING IMPORTER'
        return false
      },
      import() { throw new Error('rejected importer executed') },
    },
    code: {
      canImport(payload) {
        assert.deepEqual(payload, source, 'another importer mutated the owned source payload')
        return true
      },
      import(payload, context) {
        imports++
        assert.strictEqual(context.ownerDocument, harnessed.ownerDocument)
        assert.ok(Object.isFrozen(context))
        assert.deepEqual(payload, source)
        return { code: 'AB', language: 'auto' }
      },
    },
  })
  const result = materializeClipboardRichText(harnessed.services, { html: source.data.text }, new Set())
  assert.equal(result.type, 'code')
  assert.deepEqual(result.data, { code: 'AB', language: 'auto' })
  assert.equal(harnessed.allocated(), 1)
  assert.equal(imports, 1)
})

test('clipboard import rejects nonboolean capability decisions before importing or allocating IDs', () => {
  for (const invalid of ['yes', 1, null]) {
    let imported = false
    const h = harness({
      code: {
        canImport: () => invalid,
        import() { imported = true; return { code: 'wrong' } },
      },
    })
    assert.throws(
      () => materializeClipboardRichText(h.services, { html: 'Example' }, new Set()),
      /boolean/,
      String(invalid),
    )
    assert.equal(imported, false)
    assert.equal(h.allocated(), 0)
  }
})

test('clipboard import rejects asynchronous decisions and imports before allocating IDs', () => {
  let imported = false
  const h = harness({
    code: {
      canImport: () => Promise.resolve(true),
      import() { imported = true; return { code: 'wrong' } },
    },
  })
  assert.throws(
    () => materializeClipboardRichText(h.services, { html: 'Example' }, new Set()),
    /synchronously/,
  )
  assert.equal(imported, false)
  assert.equal(h.allocated(), 0)

  const h2 = harness({
    code: {
      canImport: () => true,
      import: () => Promise.resolve({ code: 'late' }),
    },
  })
  assert.throws(
    () => materializeClipboardRichText(h2.services, { html: 'Example' }, new Set()),
    /synchronously/,
  )
  assert.equal(h2.allocated(), 0)
})


test('invalid clipboard block version must be rejected before consuming a session ID', () => {
  const reserved = new Set(['existing'])
  let allocations = 0
  const definition = {
    schema: {
      currentVersion: 2,
      decode(envelope) { return envelope },
    },
  }
  const services = {
    getBlockDefinition: type => type === 'paragraph' ? definition : undefined,
    getInlineDefinition: () => undefined,
    allocateId(_type, ids) {
      allocations++
      const id = 'issued-' + allocations
      ids.add(id)
      return id
    },
    recordFromData() { throw new Error('invalid input reached record creation') },
  }
  assert.throws(
    () => materializeClipboardBlock(services, {
      type: 'paragraph', dataVersion: 1, data: { text: 'wrong-version content' },
    }, reserved),
    /data version|version|currentVersion/i,
  )
  assert.equal(allocations, 0, 'a rejected clipboard block consumed a permanent session ID')
  assert.deepEqual([...reserved], ['existing'])
})

test('invalid clipboard block data must be validated before allocating a block ID', () => {
  const reserved = new Set(['existing'])
  let allocations = 0
  const definition = {
    schema: {
      currentVersion: 2,
      decode(envelope) {
        if (typeof envelope.data.text !== 'string') {
          throw new TypeError('Clipboard paragraph text must be a string')
        }
        return envelope
      },
    },
  }
  const services = {
    getBlockDefinition: type => type === 'paragraph' ? definition : undefined,
    getInlineDefinition: () => undefined,
    allocateId(_type, ids) {
      allocations++
      ids.add('issued-' + allocations)
      return 'issued-' + allocations
    },
    recordFromData() { throw new Error('invalid data reached record creation') },
  }
  assert.throws(() => materializeClipboardBlock(services, {
    type: 'paragraph', dataVersion: 2, data: { text: 99 },
  }, reserved), /Clipboard paragraph text must be a string/)
  assert.equal(allocations, 0)
  assert.deepEqual([...reserved], ['existing'])
})

test('valid clipboard blocks allocate only after decoding and retain canonical data and detached identity', () => {
  const events = []
  const reserved = new Set(['existing'])
  const definition = {
    schema: {
      currentVersion: 2,
      decode(envelope) {
        events.push('decode')
        return {
          dataVersion: 2,
          data: { text: envelope.data.text.trim() },
        }
      },
    },
  }
  const services = {
    getBlockDefinition: type => type === 'paragraph' ? definition : undefined,
    getInlineDefinition: () => undefined,
    allocateId(_type, ids) {
      events.push('allocate')
      ids.add('new-block')
      return 'new-block'
    },
    recordFromData(id, type, _definition, data, tunes) {
      events.push('record')
      return { id, type, dataVersion: 2, data, tunes }
    },
  }
  const result = materializeClipboardBlock(services, {
    type: 'paragraph',
    dataVersion: 2,
    data: { text: ' Hello ' },
    tunes: { textAlign: 'center' },
  }, reserved)
  assert.deepEqual(events, ['decode', 'allocate', 'record'])
  assert.deepEqual(result, {
    id: 'new-block', type: 'paragraph', dataVersion: 2,
    data: { text: 'Hello' }, tunes: { textAlign: 'center' },
  })
  assert.deepEqual([...reserved], ['existing', 'new-block'])
})


test('invalid nested clipboard inline dataVersion cannot consume a block ID', () => {
  const reserved = new Set(['occupied'])
  let allocations = 0
  const blockDefinition = {
    schema: {
      currentVersion: 2,
      decode(input) { return input },
    },
  }
  const inlineDefinition = {
    schema: {
      currentVersion: 1,
      decode(input) { return input },
    },
  }
  const services = {
    getBlockDefinition: type => type === 'paragraph' ? blockDefinition : undefined,
    getInlineDefinition: type => type === 'mention' ? inlineDefinition : undefined,
    allocateId() {
      allocations++
      return 'issued-' + allocations
    },
    recordFromData() { throw new Error('must not assemble a mismatched inline widget') },
  }
  assert.throws(() => materializeClipboardBlock(services, {
    type: 'paragraph',
    dataVersion: 2,
    data: { text: 'Hello {{ref}}' },
    inline: { ref: { type: 'mention', dataVersion: 2, data: { label: 'Stale' } } },
  }, reserved), /version|current/i)
  assert.equal(allocations, 0)
  assert.deepEqual([...reserved], ['occupied'])
})

test('unknown current-format transfer blocks receive destination IDs while preserving opaque data', () => {
  const source = {
    type: 'unloaded-block',
    dataVersion: 7,
    data: { nested: { future: [1, 2, 3] } },
    inline: {
      'future-inline': {
        type: 'unloaded-inline',
        dataVersion: 8,
        data: { opaque: true },
      },
    },
  }
  const reserved = new Set(['occupied'])
  let allocations = 0
  const services = {
    getBlockDefinition: () => undefined,
    getInlineDefinition: () => undefined,
    allocateId(type, ids) {
      allocations++
      assert.equal(type, 'unloaded-block')
      ids.add('new-opaque')
      return 'new-opaque'
    },
    recordFromData() { throw new Error('unknown blocks must not execute plugin assembly') },
  }
  const result = materializeClipboardBlock(services, source, reserved)
  assert.equal(allocations, 1)
  assert.deepEqual(result, { id: 'new-opaque', ...source })
  assert.notStrictEqual(result.data, source.data)
  assert.notStrictEqual(result.inline, source.inline)
  assert.deepEqual([...reserved], ['occupied', 'new-opaque'])
})
