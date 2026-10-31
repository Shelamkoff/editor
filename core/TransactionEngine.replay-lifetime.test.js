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

test('a rejected immediate history selection cannot retry after a newer focus decision', async () => {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('Alpha')] })
  let attempts = 0
  const engine = new TransactionEngine({
    store, history: new HistoryStore(),
    selection: {
      capture: bookmark,
      restore() { attempts++; return false },
    },
  })
  engine.execute({ origin: 'user', name: 'edit' }, tx => tx.update('a', block('AlXpha')))
  assert.equal(engine.undo(), true)
  assert.equal(attempts, 1)
  assert.equal(store.get('a').data.text, 'Alpha')
  await Promise.resolve()
  assert.equal(attempts, 1, 'an explicitly rejected restoration was retried in a later microtask')
  assert.equal(engine.canUndo, false)
  assert.equal(engine.canRedo, true)
})

for (const action of ['undo', 'redo']) {
  test(`deferred ${action} restore completes for the unchanged live selection owner`, async () => {
    const store = new DocumentStore({ version: '2.0.0', blocks: [block('Alpha')] })
    const restorations = []
    const engine = new TransactionEngine({
      store,
      history: new HistoryStore(),
      selection: { capture: bookmark, restore: value => restorations.push(value) },
    })
    engine.execute({ origin: 'user', name: 'edit' }, tx => tx.update('a', block('AlXpha')))
    if (action === 'redo') {
      assert.equal(engine.undo(), true)
      await Promise.resolve()
      restorations.length = 0
    }
    assert.equal(engine[action](), true)
    assert.deepEqual(restorations, [bookmark()])
    const revision = store.revision
    await Promise.resolve()
    assert.deepEqual(restorations, [bookmark(), bookmark()])
    assert.equal(store.revision, revision, 'deferred selection added a history revision')
    assert.equal(store.get('a').data.text, action === 'undo' ? 'Alpha' : 'AlXpha')
    engine.destroy()
  })

  test(`deferred ${action} capture cannot restore into an owner it destroys`, async () => {
    const store = new DocumentStore({ version: '2.0.0', blocks: [block('Alpha')] })
    const history = new HistoryStore()
    const restorations = []
    let retireDuringCapture = false
    let retiredCaptures = 0
    const engine = new TransactionEngine({
      store,
      history,
      selection: {
        capture() {
          if (retireDuringCapture) {
            retireDuringCapture = false
            retiredCaptures++
            engine.destroy()
          }
          return bookmark()
        },
        restore(value) { restorations.push(value) },
      },
    })
    engine.execute({ origin: 'user', name: 'edit' }, tx => tx.update('a', block('AlXpha')))
    if (action === 'redo') {
      assert.equal(engine.undo(), true)
      await Promise.resolve()
      restorations.length = 0
    }
    assert.equal(engine[action](), true)
    assert.equal(restorations.length, 1, 'history must complete its immediate restore')
    const revision = store.revision
    retireDuringCapture = true
    await Promise.resolve()
    assert.equal(retiredCaptures, 1, 'the queued selection capture did not run')
    assert.equal(restorations.length, 1,
      'a queued selection callback restored after its capture destroyed the owner')
    assert.equal(store.revision, revision, 'retirement changed the committed history revision')
    assert.equal(store.get('a').data.text, action === 'undo' ? 'Alpha' : 'AlXpha')
    assert.equal(history.canUndo, action === 'redo')
    assert.equal(history.canRedo, action === 'undo')
  })
}
