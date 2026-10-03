import test from 'node:test'
import assert from 'node:assert/strict'

import { DocumentStore } from './DocumentStore.js'

function block(id, text = id) {
  return { id, type: 'paragraph', dataVersion: 2, data: { text } }
}

test('DocumentStore owns detached canonical records and preserves order', () => {
  const source = {
    version: '2.0.0',
    blocks: [block('a'), block('b')],
  }
  const store = new DocumentStore(source)
  source.blocks[0].data.text = 'mutated'

  assert.deepEqual(store.list().map(item => item.id), ['a', 'b'])
  assert.equal(store.get('a').data.text, 'a')

  const exported = store.export()
  exported.blocks[0].data.text = 'consumer'
  assert.equal(store.get('a').data.text, 'a')
})

test('draft mutations do not affect committed state before swap', () => {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  const draft = store.createDraft()

  draft.update('a', { ...block('a'), data: { text: 'next' } })
  draft.insert(1, block('b'))

  assert.equal(store.get('a').data.text, 'a')
  assert.equal(store.get('b'), undefined)
  assert.equal(draft.get('a').data.text, 'next')
  assert.deepEqual(draft.list().map(item => item.id), ['a', 'b'])

  store.commit(draft)
  assert.equal(store.get('a').data.text, 'next')
  assert.deepEqual(store.list().map(item => item.id), ['a', 'b'])
})

test('draft emits reversible insert update move and remove changes', () => {
  const store = new DocumentStore({
    version: '2.0.0',
    blocks: [block('a'), block('b'), block('c')],
  })
  const draft = store.createDraft()

  draft.update('a', { ...block('a'), data: { text: 'A2' } })
  draft.insert(1, block('x'))
  draft.move('c', 0)
  draft.remove('b')

  assert.deepEqual(draft.changes.map(change => change.kind), [
    'block.update',
    'block.insert',
    'block.move',
    'block.remove',
  ])
  assert.deepEqual(draft.list().map(item => item.id), ['c', 'a', 'x'])

  const reverse = store.createDraftFrom(draft.export())
  reverse.applyChanges(draft.changes, 'backward')
  assert.deepEqual(reverse.export(), {
    version: '2.0.0',
    blocks: [block('a'), block('b'), block('c')],
  })

  reverse.applyChanges(draft.changes, 'forward')
  assert.deepEqual(reverse.export(), draft.export())
})

test('move uses final zero-based index and rejects invalid operations', () => {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a'), block('b')] })
  const draft = store.createDraft()

  draft.move('a', 1)
  assert.deepEqual(draft.list().map(item => item.id), ['b', 'a'])

  assert.throws(() => draft.move('missing', 0), /Unknown block id: missing/)
  assert.throws(() => draft.move('a', -1), /Final block index is out of range/)
  assert.throws(() => draft.insert(3, block('x')), /Insert index is out of range/)
  assert.throws(() => draft.insert(0, block('a')), /Duplicate block id: a/)
})

test('whole-document replacement is one reversible change', () => {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  const draft = store.createDraft()

  draft.replace({ version: '2.0.0', blocks: [block('x'), block('y')] })

  assert.equal(draft.changes.length, 1)
  assert.equal(draft.changes[0].kind, 'document.replace')
  assert.deepEqual(draft.list().map(item => item.id), ['x', 'y'])

  draft.applyChanges(draft.changes, 'backward')
  assert.deepEqual(draft.list().map(item => item.id), ['a'])
})


test('unchanged canonical records retain identity across draft commit', () => {
  const store = new DocumentStore({
    version: '2.0.0',
    blocks: [block('a'), block('b'), block('c')],
  })
  const aBefore = store.peek('a')
  const cBefore = store.peek('c')
  const draft = store.createDraft()

  draft.update('b', block('b', 'changed'))
  store.commit(draft)

  assert.equal(store.peek('a'), aBefore)
  assert.equal(store.peek('c'), cBefore)
  assert.notEqual(store.peek('b'), undefined)
  assert.ok(Object.isFrozen(store.peek('a')))
  assert.ok(Object.isFrozen(store.peek('a').data))
})

test('prepared store commit is inert until commit and advances revision monotonically', () => {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  const draft = store.createDraft()
  draft.update('a', block('a', 'next'))
  const prepared = store.prepareCommit(draft)

  assert.equal(store.revision, 0)
  assert.equal(store.generation, 1)
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(prepared.revision, 1)
  prepared.commit()
  assert.equal(store.revision, 1)
  assert.equal(store.get('a').data.text, 'next')

  const replacement = store.createDraft()
  replacement.replace({ version: '2.0.0', blocks: [block('b')] })
  store.commit(replacement, { newGeneration: true })
  assert.equal(store.revision, 2)
  assert.equal(store.generation, 2)
})


test('metadata queries do not read block payloads on a 1000-block document', () => {
  const blocks = Array.from({ length: 1000 }, (_, index) => ({
    id: `block-${index}`,
    type: 'table',
    dataVersion: 2,
    data: {
      rows: Array.from({ length: 8 }, (__, row) => ({
        id: `r-${index}-${row}`,
        cells: Array.from({ length: 8 }, (___, column) => ({
          id: `c-${index}-${row}-${column}`,
          text: 'x'.repeat(64),
        })),
      })),
    },
  }))
  const store = new DocumentStore({ version: '2.0.0', blocks })

  const originalGet = Map.prototype.get
  let result
  try {
    Map.prototype.get = function forbiddenPayloadRead() {
      throw new Error('metadata query read a block record')
    }
    result = {
      size: store.size,
      has: store.has('block-999'),
      missing: store.has('missing'),
      first: store.idAt(0),
      last: store.idAt(999),
      invalidLow: store.idAt(-1),
      invalidHigh: store.idAt(1000),
      index: store.indexOf('block-777'),
      missingIndex: store.indexOf('missing'),
      ids: store.ids(),
    }
  } finally {
    Map.prototype.get = originalGet
  }

  assert.equal(result.size, 1000)
  assert.equal(result.has, true)
  assert.equal(result.missing, false)
  assert.equal(result.first, 'block-0')
  assert.equal(result.last, 'block-999')
  assert.equal(result.invalidLow, undefined)
  assert.equal(result.invalidHigh, undefined)
  assert.equal(result.index, 777)
  assert.equal(result.missingIndex, -1)
  assert.equal(result.ids.length, 1000)
  assert.equal(result.ids[500], 'block-500')
})

test('peek is an internal frozen identity while detached snapshot APIs remain isolated', () => {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  const canonical = store.peek('a')
  assert.ok(canonical)
  assert.ok(Object.isFrozen(canonical))
  assert.ok(Object.isFrozen(canonical.data))
  assert.equal(store.peek('a'), canonical)

  const detached = store.get('a')
  assert.notEqual(detached, canonical)
  detached.data.text = 'consumer'
  assert.equal(store.peek('a').data.text, 'a')

  const listed = store.list()
  listed[0].data.text = 'consumer-list'
  assert.equal(store.peek('a').data.text, 'a')
})
