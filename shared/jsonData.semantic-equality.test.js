import test from 'node:test'
import assert from 'node:assert/strict'
import { equalJsonValue } from './jsonData.js'

test('canonical JSON equality ignores object insertion order at any nesting depth', () => {
  const before = {
    outer: { a: 1, b: [{ name: 'a', value: 3 }, { name: 'b', value: 4 }] },
    count: 5,
  }
  const after = {
    count: 5,
    outer: { b: [{ value: 3, name: 'a' }, { value: 4, name: 'b' }], a: 1 },
  }
  assert.equal(equalJsonValue(before, after), true)
  assert.equal(equalJsonValue(after, before), true)
})

test('canonical JSON equality still distinguishes changed array ordering and missing keys', () => {
  const original = { choices: [{ id: 'first' }, { id: 'second' }] }
  assert.equal(equalJsonValue(original, { choices: [{ id: 'second' }, { id: 'first' }] }), false)
  assert.equal(equalJsonValue(original, { choices: [{ id: 'first' }] }), false)
  assert.equal(equalJsonValue({ x: 1 }, { x: 1, y: 2 }), false)
  assert.equal(equalJsonValue([], {}), false)
})

test('canonical JSON equality treats finite JSON-equivalent zero and numeric values consistently', () => {
  assert.equal(equalJsonValue({ count: -0 }, { count: 0 }), true)
  assert.equal(equalJsonValue({ count: 10 }, { count: 11 }), false)
  assert.equal(equalJsonValue(null, {}), false)
})

test('canonical JSON equality does not confuse an own __proto__ JSON key with its prototype', () => {
  const withKey = JSON.parse('{"__proto__":{"a":1},"safe":true}')
  const reordered = JSON.parse('{"safe":true,"__proto__":{"a":1}}')
  assert.equal(equalJsonValue(withKey, reordered), true)
  assert.equal(equalJsonValue(withKey, { safe: true }), false)
})
