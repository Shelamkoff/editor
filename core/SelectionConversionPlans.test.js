import test from 'node:test'
import assert from 'node:assert/strict'

import { conversionTargetData, convertedCanonicalRecord, prepareSelectionConversion } from './SelectionConversionPlans.js'

function setup() {
  const author = {
    type: 'paragraph',
    schema: { createDefault: () => ({ text: '', author: 'default' }) },
    capabilities: {
      conversion: {
        export: data => ({ kind: 'rich-text', data: { text: data.text } }),
        canImport: candidate => candidate?.kind === 'rich-text',
        import: candidate => ({ text: candidate.data.text, author: 'imported' }),
      },
    },
    toolbox: [{
      id: 'emphasis',
      configure(data, context) {
        return { ...data, author: data.author, style: 'emphasis', generated: context.createId('selection') }
      },
    }],
  }
  const code = {
    type: 'code',
    schema: { createDefault: () => ({ text: '' }) },
    capabilities: {
      conversion: {
        canImport: candidate => candidate?.kind === 'rich-text',
        import: candidate => ({ text: candidate.data.text }),
      },
    },
  }
  const definitions = new Map([author, code].map(definition => [definition.type, definition]))
  const calls = []
  const services = {
    getBlockDefinition: type => definitions.get(type),
    allocateId(prefix, reserved) {
      calls.push(prefix)
      const id = prefix + '-first'
      if (reserved.has(id)) return prefix + '-second'
      reserved.add(id)
      return id
    },
    recordFromData: (id, type, _definition, data, tunes, inline) => ({
      id, type, dataVersion: 1, data, tunes, inline,
    }),
    assertConversionInlinePreserved() {},
  }
  return { author, code, services, calls }
}

test('same-type toolbox conversion preserves author fields, tunes and inline data', () => {
  const { services } = setup()
  const source = {
    id: 'source',
    type: 'paragraph',
    dataVersion: 1,
    data: { text: 'Alpha', author: 'kept', hidden: { label: 'Source' } },
    tunes: { textAlign: 'center' },
    inline: { swatch: { type: 'color', dataVersion: 1, data: { value: '#ffffff' } } },
  }
  const result = convertedCanonicalRecord(services, source, {
    type: 'paragraph',
    toolboxItemId: 'emphasis',
  }, new Set(['source', 'selection-first']))
  assert.equal(result.id, source.id)
  assert.deepEqual(result.data, {
    text: 'Alpha', author: 'kept', hidden: { label: 'Source' },
    style: 'emphasis', generated: 'selection-second',
  })
  assert.deepEqual(result.tunes, source.tunes)
  assert.deepEqual(result.inline, source.inline)
  assert.deepEqual(source.data, { text: 'Alpha', author: 'kept', hidden: { label: 'Source' } })
})

test('conversion declines import using the target default without changing a source snapshot', () => {
  const { services, code } = setup()
  code.capabilities.conversion.canImport = () => false
  const data = conversionTargetData(services, code, {
    kind: 'rich-text', data: { text: 'not-importable' },
  }, { type: 'code' })
  assert.deepEqual(data, { text: '' })
})

test('collapsed whole-block conversion does not require a rich-text field on its current source', () => {
  const { services, code } = setup()
  code.capabilities.conversion.export = data => ({ kind: 'rich-text', data: { text: data.code } })
  const current = { id: 'source', type: 'code', dataVersion: 1, data: { code: 'Staged literal source' }, tunes: { textAlign: 'center' } }
  const view = { ids: ['staged-neighbor', 'source'], peek: id => id === 'source' ? current : undefined }
  const point = { blockId: 'source', fieldKey: 'code', offset: 3 }
  const plan = prepareSelectionConversion(services, view, { anchor: point, focus: { ...point } }, { type: 'paragraph' })
  assert.deepEqual(plan.result, { focusId: 'source', convertedIds: ['source'] })
  assert.equal(plan.edits.length, 1)
  assert.equal(plan.edits[0].kind, 'update')
  assert.deepEqual(plan.edits[0].record.data, { text: 'Staged literal source', author: 'imported' })
  assert.deepEqual(plan.edits[0].record.tunes, current.tunes)
  assert.deepEqual(current.data, { code: 'Staged literal source' })
  assert.deepEqual(prepareSelectionConversion(services, view,
    { anchor: point, focus: { ...point, offset: 4 } }, { type: 'paragraph' }), { edits: [], result: false })
})

test('asynchronous conversion acceptance fails before any target-data import', () => {
  const { services, code } = setup()
  let imports = 0
  code.capabilities.conversion.canImport = () => Promise.resolve(true)
  code.capabilities.conversion.import = () => {
    imports++
    return { text: 'should-not-run' }
  }
  assert.throws(() => conversionTargetData(services, code,
    { kind: 'rich-text', data: { text: 'Alpha' } }, { type: 'code' }),
  /synchronously/)
  assert.equal(imports, 0)
})

test('asynchronous source export fails before constructing the converted record', () => {
  const { services, author } = setup()
  let records = 0
  author.capabilities.conversion.export = () => Promise.resolve({ kind: 'rich-text', data: { text: 'late' } })
  services.recordFromData = () => { records++; throw new Error('record should not be assembled') }
  assert.throws(() => convertedCanonicalRecord(services, {
    id: 'a', type: 'paragraph', data: { text: 'Alpha' },
  }, { type: 'code' }), /synchronously/)
  assert.equal(records, 0)
})

test('collapsed block conversion supplies the owning document to the target importer', () => {
  const { services, code } = setup()
  const ownerDocument = Object.freeze({ realm: 'editor-owner' })
  services.ownerDocument = ownerDocument
  code.capabilities.conversion.import = (candidate, context) => {
    assert.strictEqual(context.ownerDocument, ownerDocument)
    assert.ok(Object.isFrozen(context), 'import context must not expose a mutable authority bag')
    return { text: candidate.data.text }
  }
  const source = {
    id: 'p',
    type: 'paragraph',
    dataVersion: 1,
    data: { text: 'Rich <b>text</b>' },
  }
  assert.deepEqual(convertedCanonicalRecord(services, source, { type: 'code' }).data, {
    text: 'Rich <b>text</b>',
  })
})
