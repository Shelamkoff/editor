import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

const block = (id, text = id) => ({ id, type: 'paragraph', dataVersion: 1, data: { text } })

function fixture() {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a'), block('b')] })
  const history = new HistoryStore()
  const events = []
  const projections = []
  const engine = new TransactionEngine({
    store, history, onCommit: event => events.push(event),
    projector: {
      prepare() {
        projections.push('prepare')
        return {
          apply() { projections.push('apply') },
          recover() { projections.push('recover') },
          discard() { projections.push('discard') },
          finalize() { projections.push('finalize') },
        }
      },
    },
  })
  engine.execute({ origin: 'user', name: 'real-edit' }, draft => draft.update('a', block('a', 'Redo me')))
  assert.equal(engine.undo(), true)
  assert.equal(history.canRedo, true)
  projections.length = 0
  events.length = 0
  return { store, history, engine, events, projections }
}

const roundtrips = {
  'empty action': () => {},
  'equal record': draft => draft.update('a', block('a')),
  'data roundtrip': draft => {
    draft.update('a', block('a', 'temporary'))
    draft.update('a', block('a'))
  },
  'move roundtrip': draft => {
    draft.move('b', 0)
    draft.move('b', 1)
  },
  'insert then remove': draft => {
    draft.insert(1, block('temporary'))
    draft.remove('temporary')
  },
  'remove then restore': draft => {
    draft.remove('a')
    draft.insert(0, block('a'))
  },
  'combined structural and data roundtrip': draft => {
    draft.move('b', 0)
    draft.remove('a')
    draft.insert(0, block('a', 'temporary'))
    draft.update('a', block('a'))
  },
  'JSON object property order': draft => {
    draft.update('a', block('a', 'temporary'))
    draft.update('a', { data: { text: 'a' }, dataVersion: 1, type: 'paragraph', id: 'a' })
  },
}

for (const [name, action] of Object.entries(roundtrips)) {
  test(`compound no-op preserves model, Redo, revision and projection: ${name}`, () => {
    const h = fixture()
    const before = h.store.export()
    const revision = h.store.revision
    const result = h.engine.execute({ origin: 'user', name }, draft => {
      action(draft)
      return 'producer result'
    })
    assert.equal(result, 'producer result')
    assert.deepEqual(h.store.export(), before)
    assert.equal(h.store.revision, revision)
    assert.equal(h.history.canUndo, false)
    assert.equal(h.history.canRedo, true)
    assert.deepEqual(h.projections, [])
    assert.deepEqual(h.events, [])
    assert.equal(h.engine.phase, 'idle')
    assert.equal(h.engine.redo(), true)
    assert.equal(h.store.get('a').data.text, 'Redo me')
  })
}

for (const [name, action] of Object.entries({
  'one record edit': draft => draft.update('a', block('a', 'changed')),
  'final data differs after roundtrip': draft => {
    roundtrips['move roundtrip'](draft)
    draft.update('a', block('a', 'changed'))
  },
  'final order differs': draft => {
    roundtrips['data roundtrip'](draft)
    draft.move('a', 1)
  },
  'replacement id differs': draft => {
    draft.remove('a')
    draft.insert(0, block('c', 'a'))
  },
  'metadata differs': draft => {
    draft.update('a', block('a', 'temporary'))
    draft.update('a', { ...block('a'), tunes: { alignment: 'center' } })
  },
})) {
  test(`genuine edit commits one action and remains replayable: ${name}`, () => {
    const h = fixture()
    const before = h.store.export()
    const revision = h.store.revision
    h.engine.execute({ origin: 'user', name }, action)
    const after = h.store.export()
    assert.notDeepEqual(after, before)
    assert.equal(h.store.revision, revision + 1)
    assert.equal(h.events.length, 1)
    assert.equal(h.history.canUndo, true)
    assert.equal(h.history.canRedo, false)
    assert.deepEqual(h.projections, ['prepare', 'apply', 'finalize'])
    assert.equal(h.engine.undo(), true)
    assert.deepEqual(h.store.export(), before)
    assert.equal(h.engine.redo(), true)
    assert.deepEqual(h.store.export(), after)
  })
}

test('equal explicit document replacement still commits a new document lifetime', () => {
  const h = fixture()
  const before = h.store.export()
  const revision = h.store.revision
  h.engine.execute({ origin: 'user', name: 'document.render' }, draft => {
    draft.replace(before)
    roundtrips['data roundtrip'](draft)
  })
  assert.deepEqual(h.store.export(), before)
  assert.equal(h.store.revision, revision + 1)
  assert.equal(h.events.length, 1)
  assert.equal(h.history.canRedo, false)
  assert.deepEqual(h.projections, ['prepare', 'apply', 'finalize'])
})

test('failed compound action still rolls back and leaves Redo available', () => {
  const h = fixture()
  const before = h.store.export()
  const revision = h.store.revision
  assert.throws(() => h.engine.execute({ origin: 'user', name: 'failed' }, draft => {
    roundtrips['data roundtrip'](draft)
    throw new Error('producer failed')
  }), /producer failed/)
  assert.deepEqual(h.store.export(), before)
  assert.equal(h.store.revision, revision)
  assert.equal(h.history.canRedo, true)
  assert.deepEqual(h.projections, [])
  assert.deepEqual(h.events, [])
})
