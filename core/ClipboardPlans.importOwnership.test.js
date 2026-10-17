import test from 'node:test'
import assert from 'node:assert/strict'
import { materializeClipboardRichText } from './ClipboardPlans.js'

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
