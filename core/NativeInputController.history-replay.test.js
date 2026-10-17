import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeInputController } from './NativeInputController.js'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

for (const replay of ['undo', 'redo']) {
  test(`native input after programmatic ${replay} preserves the replayed state as a separate undo boundary`, () => {
    const store = new DocumentStore({ version: '2.0.0', blocks: [
      { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } },
    ] })
    const history = new HistoryStore()
    const engine = new TransactionEngine({ store, history })
    const field = { value: '' }
    const owner = { blockId: 'a', fieldKey: 'text', mode: 'plain-text', element: field }
    // Only the projection adapter and clock are controlled. Real input,
    // transaction, document and history modules own grouping and replay.
    const root = {
      addEventListener() {},
      ownerDocument: { defaultView: { AbortController, performance: { now: () => 10 } } },
    }
    const runtime = {
      readOnly: false,
      syncBlockFromProjection(id, _operation, metadata) {
        engine.execute(metadata, tx => tx.update(id, { ...tx.get(id), data: { text: field.value } }))
      },
    }
    const input = new NativeInputController({
      root, runtime, reconciler: { resolveEditableTarget: target => target === field ? owner : null },
    })
    const type = text => {
      field.value = text
      input.handleInput({ target: field, inputType: 'insertText' })
    }
    try {
      type('A')
      if (replay === 'undo') {
        engine.execute({ origin: 'external', name: 'external change' }, tx => {
          tx.update('a', { ...tx.get('a'), data: { text: 'temporary' } })
        })
        engine.undo()
      } else {
        engine.undo()
        engine.redo()
      }
      type('AB')
      engine.undo()
      assert.equal(store.get('a').data.text, 'A')
      engine.undo()
      assert.equal(store.get('a').data.text, '')
    } finally { input.destroy() }
  })
}
