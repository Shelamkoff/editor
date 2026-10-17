import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

const block = (id, url, title = '') => ({
  id, type: 'linkPreview', data: {
    url, title, description: '', image: '', favicon: '',
    domain: '', template: 'notion',
  },
})
function harness() {
  const store = new DocumentStore({
    version: '2.0.0',
    blocks: [block('a', 'https://old.example'), block('b', 'https://other.example')],
  })
  const history = new HistoryStore()
  const engine = new TransactionEngine({ store, history })
  return { store, history, engine }
}
function update(engine, url, title = '', field = undefined) {
  engine.execute({
    origin: 'external', name: 'block.update',
    ...(field ? { continuation: field } : {}),
  }, tx => tx.update('a', block('a', url, title)))
}

test('URL native authoring followed by async metadata is one complete Undo/Redo unit', () => {
  const { store, history, engine } = harness()
  const before = store.get('a')
  engine.execute({ origin: 'native-input', name: 'native-input' },
    tx => tx.update('a', block('a', 'https://new.example')))
  const baseRevision = store.revision
  update(engine, 'https://new.example', 'Fetched title', {
    baseRevision, blockId: 'a', fieldKey: 'url',
  })
  assert.equal(store.get('a').data.title, 'Fetched title')
  assert.equal(history.undoDepth, 1)
  assert.equal(engine.undo(), true)
  assert.deepEqual(store.get('a'), before)
  assert.equal(history.canUndo, false)
  assert.equal(engine.redo(), true)
  assert.equal(store.get('a').data.url, 'https://new.example')
  assert.equal(store.get('a').data.title, 'Fetched title')
})

test('intervening host transaction preserves separate Undo boundaries', () => {
  const { store, history, engine } = harness()
  engine.execute({ origin: 'native-input', name: 'native-input' },
    tx => tx.update('a', block('a', 'https://new.example')))
  const baseRevision = store.revision
  engine.execute({ origin: 'external', name: 'block.update' },
    tx => tx.update('b', block('b', 'https://other.example', 'Host changed')))
  update(engine, 'https://new.example', 'Fetched title', {
    baseRevision, blockId: 'a', fieldKey: 'url',
  })
  assert.equal(history.undoDepth, 3)
  engine.undo()
  assert.equal(store.get('a').data.url, 'https://new.example')
  assert.equal(store.get('a').data.title, '')
  assert.equal(store.get('b').data.title, 'Host changed')
  engine.undo()
  assert.equal(store.get('b').data.title, '')
  engine.undo()
  assert.equal(store.get('a').data.url, 'https://old.example')
})

test('invalid continuation metadata fails before mutation', () => {
  const { store, history, engine } = harness()
  const initial = store.list()
  assert.throws(() => engine.execute({
    origin: 'external', name: 'block.update',
    continuation: { baseRevision: 1, blockId: 'a', fieldKey: '' },
  }, tx => tx.update('a', block('a', 'https://bad.example'))), TypeError)
  assert.deepEqual(store.list(), initial)
  assert.equal(history.undoDepth, 0)
})
