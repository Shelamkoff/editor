import assert from 'node:assert/strict'
import test from 'node:test'

import { EXT_COLORS, FILE_ICONS, getFileIcon } from './fileUtils.js'

test('getFileIcon ignores inherited extension map keys', () => {
  for (const extension of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.deepEqual(getFileIcon(extension), {
      svg: FILE_ICONS.default,
      key: 'default',
    })
  }
})

test('extension color registry has no inherited collision keys', () => {
  assert.equal(EXT_COLORS.constructor, undefined)
  assert.equal(EXT_COLORS.toString, undefined)
  assert.equal(EXT_COLORS.__proto__, undefined)
  assert.equal(EXT_COLORS.pdf, '#e74c3c')
})
