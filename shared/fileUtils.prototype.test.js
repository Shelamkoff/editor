import assert from 'node:assert/strict'
import test from 'node:test'

import { FILE_ICONS, getFileIcon } from './fileUtils.js'

test('getFileIcon ignores inherited extension map keys', () => {
  for (const extension of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.deepEqual(getFileIcon(extension), {
      svg: FILE_ICONS.default,
      key: 'default',
    })
  }
})
