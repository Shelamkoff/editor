import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CLIPBOARD_FRAGMENT_MIME,
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
