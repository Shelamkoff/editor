import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isTextAlign,
  normalizeHeadingLevel,
  normalizeTextAlign,
  normalizeTextValue,
} from './textFormat.js'

test('text field normalization never stringifies malformed structured data', () => {
  assert.equal(normalizeTextValue('text'), 'text')
  assert.equal(normalizeTextValue(''), '')
  assert.equal(normalizeTextValue({ text: 'nested' }), '')
  assert.equal(normalizeTextValue(['nested']), '')
  assert.equal(normalizeTextValue(null), '')
})

test('text alignment accepts only serialized contract values', () => {
  assert.equal(isTextAlign('justify'), true)
  assert.equal(isTextAlign('start'), false)
  assert.equal(normalizeTextAlign('center'), 'center')
  assert.equal(normalizeTextAlign('expression(alert(1))'), '')
})

test('heading level normalization never produces an invalid tag suffix', () => {
  assert.equal(normalizeHeadingLevel(4), 4)
  assert.equal(normalizeHeadingLevel(9), 6)
  assert.equal(normalizeHeadingLevel(1), 2)
  assert.equal(normalizeHeadingLevel(2.5), 2)
  assert.equal(normalizeHeadingLevel('3'), 3)
  assert.equal(normalizeHeadingLevel('invalid'), 2)
})
