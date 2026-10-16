import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentStore } from './DocumentStore.js'
import { PersistentBlockMap } from './PersistentBlockMap.js'

const block = (id, text = id) => ({ id, type: 'paragraph', dataVersion: 2, data: { text } })
const document = () => ({ version: '2.0.0', blocks: [block('a'), block('b'), block('c')] })

test('independent drafts retain their canonical snapshot after another draft commits', () => {
  const store = new DocumentStore(document())
  const first = store.createDraft(), second = store.createDraft()
  first.update('a', block('a', 'first'))
  store.commit(first)
  assert.equal(store.get('a').data.text, 'first')
  assert.equal(second.get('a').data.text, 'a')
  second.update('b', block('b', 'second'))
  assert.equal(store.get('b').data.text, 'b')
})

test('prepared commit cannot be changed by later mutations to the same draft', () => {
  const store = new DocumentStore(document()), draft = store.createDraft()
  draft.update('a', block('a', 'committed'))
  const prepared = store.prepareCommit(draft)
  draft.update('a', block('a', 'later'))
  draft.move('c', 0)
  draft.insert(1, block('d'))
  prepared.commit()
  assert.deepEqual(store.ids(), ['a', 'b', 'c'])
  assert.equal(store.get('a').data.text, 'committed')
  assert.equal(store.has('d'), false)
})

test('public snapshotState continues returning detached mutable containers', () => {
  const store = new DocumentStore(document()), draft = store.createDraft()
  const detached = draft.snapshotState(store)
  detached.order.reverse()
  detached.blocks.set('a', Object.freeze(block('a', 'injected')))
  assert.deepEqual(store.ids(), ['a', 'b', 'c'])
  assert.deepEqual(draft.ids(), ['a', 'b', 'c'])
  assert.equal(store.get('a').data.text, 'a')
})

test('immutable block index remains balanced through ordered updates and deletions', () => {
  let index = new PersistentBlockMap()
  const previous = index
  for (let i = 0; i < 20000; i++) index = index.withSet('key-' + String(i).padStart(6, '0'), i)
  assert.equal(previous.get('key-000001'), undefined)
  for (let i = 0; i < 20000; i++) assert.equal(index.get('key-' + String(i).padStart(6, '0')), i)
  const beforeDeletes = index
  for (let i = 0; i < 20000; i += 2) index = index.withDelete('key-' + String(i).padStart(6, '0'))
  for (let i = 0; i < 20000; i++) assert.equal(index.has('key-' + String(i).padStart(6, '0')), i % 2 === 1)
  assert.equal(beforeDeletes.get('key-000002'), 2)
  assert.equal([...index].length, 10000)
})
