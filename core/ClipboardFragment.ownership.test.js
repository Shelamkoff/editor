import test from 'node:test'
import assert from 'node:assert/strict'
import { createClipboardFragment, transferBlockFromRecord } from './ClipboardFragment.js'

test('clipboard fragments capture kind and HTML getters exactly once', () => {
  const reads = { kind: 0, html: 0 }
  const part = {
    get kind() {
      reads.kind++
      return 'rich-text'
    },
    get html() {
      reads.html++
      return reads.html === 1 ? '<b>owned</b>' : '<i>changed</i>'
    },
  }
  const fragment = createClipboardFragment([part])
  assert.deepEqual(fragment.parts, [{ kind: 'rich-text', html: '<b>owned</b>' }])
  assert.deepEqual(reads, { kind: 1, html: 1 })
})

test('clipboard part kind cannot change between validation and dispatch', () => {
  let reads = 0
  const part = {
    get kind() { return ++reads === 1 ? 'unexpected' : 'block' },
    block: { type: 'paragraph', dataVersion: 2, data: { text: 'valid' } },
  }
  assert.throws(() => createClipboardFragment([part]), /part kind/)
  assert.equal(reads, 1)
})

test('clipboard fragment preparation never calls caller-owned Array.map', () => {
  const parts = [{ kind: 'rich-text', html: 'Safe' }]
  let calls = 0
  Object.defineProperty(parts, 'map', {
    value() { calls++; throw new Error('caller array map must not run') },
  })
  const result = createClipboardFragment(parts)
  assert.deepEqual(result.parts, [{ kind: 'rich-text', html: 'Safe' }])
  assert.equal(calls, 0)
})

test('clipboard block type must be an actual non-empty string, never coerced', () => {
  let coerced = 0
  const type = { toString() { coerced++; return 'paragraph' } }
  assert.throws(() => transferBlockFromRecord({
    type, dataVersion: 2, data: { text: 'Valid content' },
  }), /block type must be/)
  assert.equal(coerced, 0, 'invalid block type triggered user-owned coercion')
  for (const invalid of [0, false, null, '', [], {}]) {
    assert.throws(() => transferBlockFromRecord({
      type: invalid, dataVersion: 2, data: { text: 'Valid content' },
    }), /block type must be/)
  }
})
