// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import { DocumentSnapshotStore } from '../core/DocumentSnapshotStore.js'
import { EditorRenderer } from '../renderer/index.js'
import { resolveValidationMode } from './validationMode.js'

test('validation mode resolver accepts only the documented runtime values', () => {
  assert.equal(resolveValidationMode(undefined), 'preserve')
  assert.equal(resolveValidationMode('preserve'), 'preserve')
  assert.equal(resolveValidationMode('strict'), 'strict')

  for (const invalid of ['strcit', '', null, true, 1]) {
    assert.throws(() => resolveValidationMode(invalid), /validationMode must be "preserve" or "strict"/)
  }
})

test('editor snapshots and renderer both reject invalid validationMode values', () => {
  const blocks = { *[Symbol.iterator]() {} }
  assert.throws(
    () => new DocumentSnapshotStore(blocks, null, { validationMode: 'strcit' }),
    /validationMode must be "preserve" or "strict"/,
  )
  assert.throws(
    () => new EditorRenderer({ validationMode: 'strcit', blockTypes: [] }),
    /validationMode must be "preserve" or "strict"/,
  )
})
