// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareInsertClipboardParts } from './ClipboardPlans.js'

function fixture() {
  const current = { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }
  const view = { ids: ['a'], peek: id => id === 'a' ? current : null }
  let seq = 0
  const definition = { capabilities: { empty: { isEmpty: data => data.text.trim().length === 0 } } }
  const s = {
    getBlockDefinition: type => type === 'paragraph' ? definition : null,
    normalizeLocalData(_definition, data) {
      if (!data || typeof data.text !== 'string') throw new TypeError('Invalid local paragraph')
      return { dataVersion: 2, data }
    },
    allocateId: () => 'new-' + (++seq),
    recordFromData: (id, type, _definition, data) => ({ id, type, dataVersion: 2, data }),
  }
  return { view, s }
}

test('local HTML blocks atomically replace an empty anchor and insert the rest', () => {
  const { view, s } = fixture()
  const prepared = prepareInsertClipboardParts(s, view, 'a', 'text', { start: 0, end: 0 }, [
    { kind: 'local-block', type: 'paragraph', data: { text: 'X' } },
    { kind: 'local-block', type: 'paragraph', data: { text: 'Y' } },
  ])
  assert.deepEqual(prepared.edits.map(edit => edit.kind), ['update', 'insert'])
  assert.equal(prepared.edits[0].record.id, 'a')
  assert.equal(prepared.edits[0].record.data.text, 'X')
  assert.equal(prepared.edits[1].index, 1)
  assert.equal(prepared.edits[1].record.data.text, 'Y')
  assert.deepEqual(prepared.result.inserted, ['a', 'new-2'])
})

test('invalid HTML local-block payload is rejected before publishing any edit', () => {
  const { view, s } = fixture()
  assert.throws(() => prepareInsertClipboardParts(s, view, 'a', 'text', { start: 0, end: 0 }, [
    { kind: 'local-block', type: 'paragraph', data: { invalid: true } },
  ]), /Invalid local paragraph/)
})
