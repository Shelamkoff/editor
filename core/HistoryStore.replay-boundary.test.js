import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

function harness({ maxStack = 100, projector } = {}) {
  const store = new DocumentStore({
    version: '2.0.0',
    blocks: [{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }],
  })
  const history = new HistoryStore({ maxStack })
  const engine = new TransactionEngine({ store, history, projector })
  const write = (text, group = 'native:a:text:1', origin = 'native-input') => {
    engine.execute({ origin, name: origin, coalesce: origin === 'native-input', historyGroup: group }, tx => {
      tx.update('a', { ...tx.get('a'), data: { text } })
    })
  }
  return { store, history, engine, write, text: () => store.get('a').data.text }
}

for (const action of ['undo', 'redo']) {
  test(`typing after ${action} is a new undo step even when the native coalescing group is unchanged`, () => {
    const h = harness()
    h.write('A')
    if (action === 'undo') {
      h.write('temporary', 'external:a', 'external')
      h.engine.undo()
    } else {
      h.engine.undo()
      h.engine.redo()
    }
    assert.equal(h.text(), 'A')
    h.write('AB')
    assert.equal(h.text(), 'AB')
    h.engine.undo()
    assert.equal(h.text(), 'A', 'new typing overwrote the history entry reached by replay')
    h.engine.undo()
    assert.equal(h.text(), '')
    h.engine.redo()
    assert.equal(h.text(), 'A')
    h.engine.redo()
    assert.equal(h.text(), 'AB')
  })
}

test('ordinary consecutive typing still coalesces into one history step', () => {
  const h = harness()
  h.write('A')
  h.write('AB')
  h.write('ABC')
  assert.equal(h.history.undoDepth, 1)
  h.engine.undo()
  assert.equal(h.text(), '')
  h.engine.redo()
  assert.equal(h.text(), 'ABC')
})

test('typing after the replay boundary can form its own continuous group', () => {
  const h = harness()
  h.write('A')
  h.engine.undo()
  h.engine.redo()
  h.write('AB')
  h.write('ABC')
  h.write('ABCD')
  assert.equal(h.history.undoDepth, 2)
  h.engine.undo()
  assert.equal(h.text(), 'A')
  h.engine.redo()
  assert.equal(h.text(), 'ABCD')
})

test('preparing but not committing a history replay does not interrupt a typing group', () => {
  const h = harness()
  h.write('A')
  assert.ok(h.history.prepareReplay('undo'))
  h.write('AB')
  assert.equal(h.history.undoDepth, 1)
  h.engine.undo()
  assert.equal(h.text(), '')
})

test('a failed replay leaves both history cursor and coalescing eligibility unchanged', () => {
  let fail = false
  const h = harness({ projector: {
    prepare() {
      return {
        apply() { if (fail) throw new Error('projection unavailable') },
        recover() {}, finalize() {}, discard() {},
      }
    },
  } })
  h.write('A')
  fail = true
  assert.throws(() => h.engine.undo(), /projection unavailable/)
  assert.equal(h.text(), 'A')
  assert.equal(h.history.canRedo, false)
  fail = false
  h.write('AB')
  assert.equal(h.history.undoDepth, 1)
  h.engine.undo()
  assert.equal(h.text(), '')
})

test('a failed edit after replay does not consume the new-history-step boundary', () => {
  let fail = false
  const h = harness({ projector: {
    prepare() {
      return {
        apply() { if (fail) throw new Error('projection unavailable') },
        recover() {}, finalize() {}, discard() {},
      }
    },
  } })
  h.write('A')
  h.engine.undo()
  h.engine.redo()
  fail = true
  assert.throws(() => h.write('rejected'), /projection unavailable/)
  fail = false
  h.write('AB')
  h.engine.undo()
  assert.equal(h.text(), 'A')
})

test('a one-entry history limit retains the replayed content as the next edit before-state', () => {
  const h = harness({ maxStack: 1 })
  h.write('A')
  h.engine.undo()
  h.engine.redo()
  h.write('AB')
  h.engine.undo()
  assert.equal(h.text(), 'A')
  assert.equal(h.history.canUndo, false)
  h.engine.redo()
  assert.equal(h.text(), 'AB')
})
