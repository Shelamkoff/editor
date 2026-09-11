import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_VISIBLE, getSlotsCount } from './layout.js'

test('getSlotsCount ignores inherited poly slot keys', () => {
  for (const layout of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.equal(getSlotsCount(layout), MAX_VISIBLE)
  }
})
