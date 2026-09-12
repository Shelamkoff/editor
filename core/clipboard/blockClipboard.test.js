import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBlockClipboardPayload } from './blockClipboard.js'

test('block clipboard parser accepts canonical required block fields', () => {
  assert.deepEqual(parseBlockClipboardPayload(JSON.stringify([
    { type: 'paragraph', data: { text: 'A' } },
    { type: 'opaque-widget', data: {}, tunes: ['ignored downstream'] },
  ])), [
    { type: 'paragraph', data: { text: 'A' } },
    { type: 'opaque-widget', data: {}, tunes: ['ignored downstream'] },
  ])
})

test('block clipboard parser rejects payloads that cannot represent complete blocks', () => {
  const malformed = [
    '', '{}', '[]',
    JSON.stringify([{ type: '', data: {} }]),
    JSON.stringify([{ type: '   ', data: {} }]),
    JSON.stringify([{ type: 'paragraph', data: [] }]),
    JSON.stringify([{ type: 'paragraph', data: null }]),
    JSON.stringify([
      { type: 'paragraph', data: { text: 'valid prefix' } },
      { type: 'paragraph', data: [] },
    ]),
  ]
  for (const value of malformed) assert.equal(parseBlockClipboardPayload(value), null)
})
