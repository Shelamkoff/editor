import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assembleCanonicalRecord,
  createSessionIdAllocator,
  captureDocumentView,
  canonicalRecordsEqual,
} from './CanonicalTransforms.js'

test('captured views retain immutable references/order and never traverse unrelated payloads', () => {
  let reads=0,lookups=0
  const first=Object.freeze({id:'a',get data(){reads++;throw new Error('Payload must remain unobserved')}})
  const second=Object.freeze({id:'b'})
  const records=new Map([['a',first],['b',second]])
  const order=['a','b']
  const view=captureDocumentView({ids:()=>order,peek:id=>{lookups++;return records.get(id)}})
  records.set('a',Object.freeze({id:'a',data:{text:'Later'}}))
  order.reverse()
  assert.deepEqual(view.ids,['a','b'])
  assert.equal(Object.isFrozen(view.ids),true)
  assert.equal(view.peek('a'),first)
  assert.equal(view.peek('a'),first)
  assert.equal(reads,0)
  assert.equal(lookups,2)
  assert.deepEqual([...view.references()],[['a',first]])
})

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

test('JSON object key order does not create an authored edit or phantom revision', () => {
  const dataA = JSON.parse('{"a":1,"nested":{"x":2,"y":3},"list":[{"p":1,"q":2}]}')
  const dataB = JSON.parse('{"list":[{"q":2,"p":1}],"nested":{"y":3,"x":2},"a":1}')
  const inlineA = JSON.parse('{"__proto__":{"type":"mention","dataVersion":1,"data":{"id":"1","name":"Ada"}}}')
  const inlineB = JSON.parse('{"__proto__":{"data":{"name":"Ada","id":"1"},"dataVersion":1,"type":"mention"}}')
  const left = { id: 'a', type: 'custom', dataVersion: 1, data: dataA, tunes: { textAlign: 'center' }, inline: inlineA, revision: 10 }
  const right = { id: 'a', type: 'custom', dataVersion: 1, data: dataB, tunes: { textAlign: 'center' }, inline: inlineB, revision: 11 }
  assert.equal(canonicalRecordsEqual(left, right), true)
  assert.equal(canonicalRecordsEqual(right, left), true)
})

test('canonical equality still recognizes array order and genuine content changes', () => {
  const record = data => ({ id: 'a', type: 'custom', dataVersion: 1, data })
  assert.equal(canonicalRecordsEqual(record({ items: [1, 2] }), record({ items: [2, 1] })), false)
  assert.equal(canonicalRecordsEqual(record({ count: 1 }), record({ count: 2 })), false)
  assert.equal(canonicalRecordsEqual(record({ a: 1 }), record({ a: 1, b: null })), false)
  assert.equal(canonicalRecordsEqual(record({ items: [{ x: 1 }] }), record({ items: [{ x: 1 }] })), true)
  assert.equal(canonicalRecordsEqual({ ...record({}), type: 'first' }, { ...record({}), type: 'second' }), false)
})
