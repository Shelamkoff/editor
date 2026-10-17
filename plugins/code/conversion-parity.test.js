import test from 'node:test'
import assert from 'node:assert/strict'

import { createCodePlugin } from './index.js'

const conversion = createCodePlugin({ injectStyles: false }).capabilities.conversion

test('Code conversion keeps literal plain text, including source-looking HTML', () => {
  assert.deepEqual(conversion.import({
    kind: 'plain-text',
    data: { text: '<b>literal source</b>\n&word;' },
  }), { code: '<b>literal source</b>\n&word;', language: 'auto' })
})

test('Code rich-text conversion requires a document instead of persisting markup as code', () => {
  assert.throws(() => conversion.import({
    kind: 'rich-text',
    data: { text: 'First <b>bold</b><br>last' },
  }), /owning document|ownerDocument/)
})
