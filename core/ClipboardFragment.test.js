import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CLIPBOARD_FRAGMENT_MIME,
  CLIPBOARD_FRAGMENT_VERSION,
  createClipboardFragment,
  decodeClipboardFragment,
  encodeClipboardFragment,
  transferBlockFromRecord,
} from './ClipboardFragment.js'

test('clipboard fragment v2 round-trips without persisted block identity', () => {
  assert.equal(CLIPBOARD_FRAGMENT_MIME, 'application/x-rector-fragment')
  const block=transferBlockFromRecord({
    id:'source-id',
    revision:'producer',
    type:'paragraph',
    dataVersion:2,
    data:{text:'Hello'},
    tunes:{textAlign:'center'},
  })
  assert.equal(Object.hasOwn(block,'id'),false)
  assert.equal(Object.hasOwn(block,'revision'),false)

  const fragment=createClipboardFragment([
    {kind:'rich-text',html:'A {{inline}}',inline:{
      inline:{type:'future-inline',dataVersion:7,data:{opaque:true}},
    }},
    {kind:'block',block},
  ])
  assert.deepEqual(decodeClipboardFragment(encodeClipboardFragment(fragment)),fragment)
})

test('clipboard fragment rejects missing, old and future versions without legacy shapes', () => {
  for(const input of [
    '{}',
    JSON.stringify({version:1,parts:[{kind:'rich-text',html:'x'}]}),
    JSON.stringify({version:3,parts:[{kind:'rich-text',html:'x'}]}),
    JSON.stringify({version:2,blocks:[{type:'paragraph'}],parts:[{kind:'rich-text',html:'x'}]}),
  ]){
    assert.throws(()=>decodeClipboardFragment(input))
  }
})

test('clipboard fragment requires exact transfer block dataVersion and dense non-empty parts', () => {
  assert.throws(()=>decodeClipboardFragment(JSON.stringify({version:2,parts:[]})),/non-empty/)
  assert.throws(()=>createClipboardFragment([{
    kind:'block',
    block:{type:'paragraph',data:{text:'missing version'}},
  }]),/dataVersion/)
})


test('private clipboard v2 rejects undeclared envelope, part, and transfer-block fields', () => {
  const textPart = { kind: 'rich-text', html: '<b>Text</b>' }
  const block = { type: 'paragraph', dataVersion: 2, data: { text: 'Valid' } }
  const invalid = [
    { version: 2, parts: [textPart], futureEnvelope: { retained: true } },
    { version: 2, parts: [{ ...textPart, futurePart: { retained: true } }] },
    { version: 2, parts: [{ kind: 'block', block: { ...block, futureBlock: { retained: true } } }] },
    { version: 2, parts: [{ kind: 'block', block: { ...block, id: 'old-source-id' } }] },
    { version: 2, parts: [{ kind: 'block', block: { ...block, revision: 'obsolete-producer' } }] },
  ]
  for (const fragment of invalid) {
    assert.throws(() => decodeClipboardFragment(JSON.stringify(fragment)),
      /unknown|undeclared|legacy|removed|unsupported/i,
      'a future or origin-only Clipboard field was silently removed')
  }
})

test('private clipboard v2 retains valid opaque blocks without inventing legacy data', () => {
  const fragment = {
    version: 2,
    parts: [{
      kind: 'block',
      block: {
        type: 'not-yet-installed',
        dataVersion: 9,
        data: { media: { identifier: 'opaque' }, fields: ['a', 'b'] },
        inline: { 'future-ref': { type: 'not-yet-installed-inline', dataVersion: 4, data: { opaque: true } } },
      },
    }],
  }
  assert.deepEqual(decodeClipboardFragment(JSON.stringify(fragment)), fragment)
})


test('private Clipboard rejects malformed nested inline maps before exposing any fragment parts', () => {
  const validBlock = { type: 'paragraph', dataVersion: 2, data: { text: 'Hello' } }
  const invalidInlineMaps = [
    { mention: { type: 'mention', data: { id: 'missing-version' } } },
    { mention: { type: 'mention', dataVersion: 0, data: { id: 'wrong-version' } } },
    { mention: { type: 'mention', dataVersion: 1, data: { id: 'unknown-field' }, future: true } },
    { mention: { type: 'mention', dataVersion: 1, data: 'not an object' } },
  ]
  for (const inline of invalidInlineMaps) {
    for (const part of [
      { kind: 'rich-text', html: 'Hello {{mention}}', inline },
      { kind: 'block', block: { ...validBlock, inline } },
    ]) {
      assert.throws(() => decodeClipboardFragment(JSON.stringify({
        version: CLIPBOARD_FRAGMENT_VERSION, parts: [part],
      })), /dataVersion|version|unknown|unsupported|JSON object/i)
    }
  }
})

test('private Clipboard keeps exact-version opaque inline records for unregistered types', () => {
  const inline = {
    ref: {
      type: 'future-inline',
      dataVersion: 9,
      data: { nested: { opaque: [1, 2] } },
    },
  }
  const fragment = {
    version: CLIPBOARD_FRAGMENT_VERSION,
    parts: [
      { kind: 'rich-text', html: '{{ref}}', inline },
      { kind: 'block', block: {
        type: 'future-block',
        dataVersion: 7,
        data: { text: '{{ref}}' },
        inline,
      } },
    ],
  }
  assert.deepEqual(decodeClipboardFragment(JSON.stringify(fragment)), fragment)
})
