import test from 'node:test'
import assert from 'node:assert/strict'
import { captureEditableFields } from './projectionFields.js'

test('editable descriptor capture cannot bypass validation through an overridden array method', () => {
  const fields = [{ key: '', element: {}, mode: 'rich-text' }]
  fields.map = () => [{ key: 'forged', element: {}, mode: 'rich-text' }]
  assert.throws(() => captureEditableFields(fields), /field keys/)
})
