import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

const block = text => ({ id: 'a', type: 'paragraph', data: { text } })
const bookmark = () => ({
  anchor: { blockId: 'a', fieldKey: 'text', offset: 2 },
  focus: { blockId: 'a', fieldKey: 'text', offset: 2 },
})

test('TransactionEngine teardown retires queued Undo caret restore without reverting committed model', async () => {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('Alpha')] })
  const restorations = []
  const engine = new TransactionEngine({
    store,
    history: new HistoryStore(),
    selection: {
      capture: bookmark,
      restore(value) { restorations.push(value) },
    },
  })
  engine.execute({ origin: 'external', name: 'host.edit' }, tx => {
    tx.update('a', block('AlXpha'))
  })
  assert.equal(engine.undo(), true)
  const immediate = restorations.length
  assert.equal(immediate, 1, 'Undo must restore its immediate selection')
  assert.equal(store.get('a').data.text, 'Alpha')

  engine.destroy()
  await Promise.resolve()
  assert.equal(restorations.length, immediate,
    'retired engine sent a queued selection into a destroyed editor')
  assert.equal(store.get('a').data.text, 'Alpha')
  assert.throws(() => engine.redo(), /destroyed/,
    'retired engine accepted a new history transaction')
  assert.throws(() => engine.execute({ origin: 'user', name: 'late' }, () => {}), /destroyed/)
  engine.destroy()
})

test('TransactionEngine destroyed during an Undo observer does not run the queued restore', async () => {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('A')] })
  const restored = []
  let engine
  engine = new TransactionEngine({
    store, history: new HistoryStore(),
    selection: { capture: bookmark, restore: value => restored.push(value) },
    onCommit(event) { if (event.action === 'undo') engine.destroy() },
  })
  engine.execute({ origin: 'user', name: 'edit' }, tx => tx.update('a', block('B')))
  assert.equal(engine.undo(), true)
  const immediate = restored.length
  await Promise.resolve()
  assert.equal(restored.length, immediate)
  assert.equal(store.get('a').data.text, 'A',
    'disposal inside an event observer rolled back a committed Undo')
})
