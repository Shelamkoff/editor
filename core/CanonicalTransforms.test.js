import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assembleCanonicalRecord,
  createSessionIdAllocator,
} from './CanonicalTransforms.js'

test('session allocator never reuses emitted ids and respects reserved ids', () => {
  const values=['a','a','blocked','b','a','c']
  let index=0
  const allocate=createSessionIdAllocator(() => values[index++])
  const reserved=new Set(['blocked'])

  assert.equal(allocate('item'), 'a')
  assert.equal(allocate('item', reserved), 'b')
  assert.equal(reserved.has('b'), true)
  assert.equal(allocate('item'), 'c')
  assert.equal(index, 6)
})

test('canonical record assembly owns current data/tunes and never carries producer revision', () => {
  const definition={schema:{}}
  const source={text:' source '}
  const record=assembleCanonicalRecord({
    id:'a',
    type:'probe',
    definition,
    data:source,
    tunes:{textAlign:'center'},
    inlineSource:undefined,
    ownerDocument:undefined,
    normalizeData(_definition,data){
      return {dataVersion:3,data:{text:String(data.text).trim()}}
    },
    normalizeTunes(tunes){
      return tunes?{...tunes}:undefined
    },
  })

  assert.deepEqual(record,{
    id:'a',
    type:'probe',
    dataVersion:3,
    data:{text:'source'},
    tunes:{textAlign:'center'},
  })
  assert.deepEqual(source,{text:' source '})
  assert.equal(Object.hasOwn(record,'revision'),false)
})
