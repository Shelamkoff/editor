import test from 'node:test'
import assert from 'node:assert/strict'
import { captureEditableFields } from './projectionFields.js'

test('editable descriptor capture cannot bypass validation through an overridden array method', () => {
  const fields = [{ key: '', element: {}, mode: 'rich-text' }]
  fields.map = () => [{ key: 'forged', element: {}, mode: 'rich-text' }]
  assert.throws(() => captureEditableFields(fields), /field keys/)
})

test('field capture ignores descriptors added after reading the initial length', () => {
  const first = { key: 'first', element: {}, mode: 'rich-text' }
  const fields = [first]
  Object.defineProperty(fields, '0', {
    get() { fields.push({ ...first, key: 'added', element: {} }); return first },
  })

  assert.deepEqual(captureEditableFields(fields), [first])
})

test('field capture rejects a descriptor removed during capture', () => {
  const first = { key: 'first', element: {}, mode: 'rich-text' }
  const fields = [first, { ...first, key: 'removed', element: {} }]
  Object.defineProperty(fields, '0', {
    get() { fields.length = 1; return first },
  })

  assert.throws(() => captureEditableFields(fields), /dense array/)
})
