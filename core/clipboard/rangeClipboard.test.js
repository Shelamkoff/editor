import assert from 'node:assert/strict'
import test from 'node:test'
import { parseClipboardFragment } from './rangeClipboard.js'

test('clipboard fragment parser accepts a valid inline widget payload', () => {
  assert.deepEqual(parseClipboardFragment(JSON.stringify({
    version: 1,
    html: '<p>{{w1}}</p>',
    inline: { w1: { type: 'mention', data: { id: '1', name: 'Anna' } } },
  })), {
    html: '<p>{{w1}}</p>',
    inline: { w1: { type: 'mention', data: { id: '1', name: 'Anna' } } },
  })
})

test('clipboard fragment parser rejects inline widgets with an empty type', () => {
  for (const type of ['', '   ']) {
    assert.equal(parseClipboardFragment(JSON.stringify({
      version: 1,
      html: '<p>{{w1}}</p>',
      inline: { w1: { type, data: { id: '1' } } },
    })), null)
  }
})

test('clipboard fragment parser rejects non-record inline widget data', () => {
  assert.equal(parseClipboardFragment(JSON.stringify({
    version: 1,
    html: '<p>{{w1}}</p>',
    inline: { w1: { type: 'mention', data: [] } },
  })), null)
})
