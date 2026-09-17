import assert from 'node:assert/strict'
import test from 'node:test'
import DOMPurify from 'dompurify'

test('runtime sanitizer stays on the audited DOMPurify release', () => {
  assert.equal(DOMPurify.version, '3.4.15')
})
