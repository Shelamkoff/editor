import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

const block = (id, text) => ({
  id, type: 'paragraph', dataVersion: 2,
  data: { text, nested: { values: ['one', { two: 2 }] } },
  inline: { opaque: { type: 'unknown', dataVersion: 7, data: { label: ['kept'] } } },
})
const document = blocks => ({ version: '2.0.0', blocks })

function descendants(value, result = new Set()) {
  if (!value || typeof value !== 'object' || result.has(value)) return result
  result.add(value)
  for (const child of Object.values(value)) descendants(child, result)
  return result
}

test('private draft journaling does not recapture an already owned immutable record', () => {
  const store = new DocumentStore(document([block('a', 'Alpha'), block('b', 'Beta')]))
  const draft = store.createDraft()
  const canonical = descendants(store.peek('a'))
  descendants(store.peek('b'), canonical)
  const original = Object.getOwnPropertySymbols
  let recaptured = 0
  // The strict JSON ownership boundary uses this observable standard operation.
  // Count only the canonical graph already owned by this store, separately
  // from caller validation and detached snapshot creation.
  Object.getOwnPropertySymbols = value => {
    if (canonical.has(value)) recaptured++
    return original(value)
  }
  try {
    draft.update('a', block('a', 'Edited'))
    draft.remove('b')
  } finally { Object.getOwnPropertySymbols = original }
  assert.equal(recaptured, 0, 'journaling revalidated/captured its private canonical graph')
  assert.equal(store.get('a').data.text, 'Alpha')
  assert.deepEqual(draft.changes.map(change => change.kind), ['block.update', 'block.remove'])
})

test('every returned journal snapshot remains mutable and detached after further draft edits', () => {
  const before = document([block('a', 'Alpha'), block('b', 'Beta')])
  const store = new DocumentStore(before)
  const draft = store.createDraft()
  const next = block('a', 'First')
  const inserted = block('x', 'Added')
  draft.update('a', next)
  draft.insert(1, inserted)
  draft.move('b', 0)
  draft.remove('x')
  const first = draft.changes
  const expected = structuredClone(first)

  next.data.nested.values[1].two = 999
  inserted.inline.opaque.data.label.push('external')
  first[0].before.data.text = 'consumer-before'
  first[0].after.data.nested.values[1].two = 123
  first[1].block.data.text = 'consumer-insert'
  first[2].to = 42
  first[3].block.inline.opaque.data.label.push('consumer-remove')
  first.push({ kind: 'consumer' })
  assert.deepEqual(draft.changes, expected)
  assert.deepEqual(store.export(), before)
  assert.equal(draft.get('a').data.text, 'First')
  assert.equal(draft.get('a').data.nested.values[1].two, 2)

  draft.update('a', block('a', 'Second'))
  const fresh = draft.changes
  assert.equal(fresh[0].before.data.text, 'Alpha')
  assert.equal(fresh[0].after.data.text, 'First')
  assert.equal(fresh[4].before.data.text, 'First')
  assert.equal(fresh[4].after.data.text, 'Second')
  assert.notEqual(fresh[0].after, fresh[4].before)
  assert.notEqual(fresh[0].after.data, fresh[4].before.data)
})

test('frozen external input is still captured once and never gains canonical provenance', () => {
  const store = new DocumentStore(document([block('a', 'Alpha')]))
  const draft = store.createDraft()
  const external = { nested: { values: [1] } }
  let reads = 0
  Object.defineProperty(external, 'text', {
    enumerable: true,
    get() { reads++; return 'Captured'; },
  })
  Object.freeze(external)
  draft.update('a', Object.freeze({ id: 'a', type: 'paragraph', dataVersion: 2, data: external }))
  assert.equal(reads, 1)
  external.nested.values.push(2)
  assert.deepEqual(draft.get('a').data, { nested: { values: [1] }, text: 'Captured' })
  assert.equal(reads, 1, 'journal/snapshot reread a retained external accessor')

  const cycle = {}; cycle.self = cycle; Object.freeze(cycle)
  assert.throws(() => draft.insert(1, Object.freeze({ id: 'x', type: 'paragraph', data: cycle })), /circular/i)
  assert.throws(() => draft.insert(1, Object.freeze({ id: 'x', type: 'paragraph', data: { number: Infinity } })), /finite/i)
  assert.deepEqual(draft.ids(), ['a'])
  assert.equal(draft.changes.length, 1)
})

test('journal sharing preserves immutable events, isolated history queries and exact replay', () => {
  const before = document([block('a', 'Alpha'), block('b', 'Beta')])
  const after = document([block('b', 'Beta'), block('a', 'Second')])
  const store = new DocumentStore(before)
  const history = new HistoryStore()
  const events = []
  const engine = new TransactionEngine({ store, history, onCommit: event => events.push(event) })
  engine.execute({ origin: 'user', name: 'journal-edit' }, tx => {
    tx.update('a', block('a', 'First'))
    tx.insert(1, block('x', 'Added'))
    tx.move('b', 0)
    tx.remove('x')
    tx.update('a', block('a', 'Second'))
  })
  assert.deepEqual(store.export(), after)
  assert.equal(history.undoDepth, 1)
  assert.throws(() => { events[0].changes[0].before.data.nested.values.push('event'); }, TypeError)
  assert.throws(() => { events[0].changes[3].block.inline.opaque.data.label.push('event'); }, TypeError)
  const queried = history.peekUndo()
  queried.changes[0].before.data.text = 'history-consumer'
  queried.changes[4].after.inline.opaque.data.label.push('history-consumer')
  const saved = store.export()
  saved.blocks[0].data.text = 'saved-consumer'

  assert.equal(engine.undo(), true)
  assert.deepEqual(store.export(), before)
  assert.equal(engine.redo(), true)
  assert.deepEqual(store.export(), after)
  assert.equal(events.length, 3)
  assert.equal(events[0].changes[0].before.data.text, 'Alpha')
  assert.equal(events[0].changes[4].after.data.text, 'Second')
  assert.deepEqual(events[0].changes[4].after.inline.opaque.data.label, ['kept'])
})
