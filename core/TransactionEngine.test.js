import test from 'node:test'
import assert from 'node:assert/strict'

import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

function block(id, text = id) {
  return { id, type: 'paragraph', data: { text } }
}

function harness(options = {}) {
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  const history = new HistoryStore()
  const projections = []
  const projector = options.projector ?? {
    prepare(change) {
      projections.push(['prepare', change.after.blocks.map(item => item.id)])
      return {
        apply() { projections.push(['apply']) },
        recover() { projections.push(['recover']) },
      }
    },
  }
  const engine = new TransactionEngine({
    store,
    history,
    projector,
    selection: options.selection,
    onCommit: options.onCommit,
    onDiagnostic: options.onDiagnostic,
  })
  return { store, history, engine, projections }
}

test('TransactionEngine commits draft only after projection succeeds', () => {
  const { store, history, engine, projections } = harness()
  const result = engine.execute({ origin: 'user', name: 'insert' }, tx => {
    tx.insert(1, block('b'))
    assert.equal(store.get('b'), undefined)
    return 'ok'
  })

  assert.equal(result, 'ok')
  assert.deepEqual(store.list().map(item => item.id), ['a', 'b'])
  assert.equal(history.canUndo, true)
  assert.deepEqual(projections, [
    ['prepare', ['a', 'b']],
    ['apply'],
  ])
  assert.equal(engine.phase, 'idle')
})

test('operation failure discards draft and history', () => {
  const { store, history, engine } = harness()
  assert.throws(() => engine.execute({ origin: 'user', name: 'bad' }, tx => {
    tx.insert(1, block('b'))
    throw new Error('boom')
  }), /boom/)

  assert.deepEqual(store.list().map(item => item.id), ['a'])
  assert.equal(history.canUndo, false)
  assert.equal(engine.phase, 'idle')
})

test('nested transaction failure poisons outer transaction even when caught', () => {
  const { store, history, engine } = harness()
  assert.throws(() => engine.execute({ origin: 'user', name: 'outer' }, tx => {
    tx.update('a', block('a', 'outer'))
    try {
      engine.execute({ origin: 'plugin', name: 'nested' }, nested => {
        nested.insert(1, block('b'))
        throw new Error('nested failed')
      })
    } catch {}
    tx.insert(2, block('c'))
  }), /nested failed/)

  assert.equal(store.get('a').data.text, 'a')
  assert.equal(store.get('b'), undefined)
  assert.equal(history.canUndo, false)
})

test('mutation from projection phase is rejected and failed projection recovers', () => {
  let engine
  const events = []
  const projector = {
    prepare() {
      return {
        apply() {
          events.push('apply')
          engine.execute({ origin: 'plugin', name: 'illegal' }, tx => {
            tx.insert(1, block('x'))
          })
        },
        recover() { events.push('recover') },
      }
    },
  }
  const setup = harness({ projector })
  engine = setup.engine

  assert.throws(
    () => engine.execute({ origin: 'user', name: 'update' }, tx => {
      tx.update('a', block('a', 'next'))
    }),
    /Cannot mutate document during applying-projection phase/,
  )
  assert.equal(setup.store.get('a').data.text, 'a')
  assert.equal(setup.history.canUndo, false)
  assert.deepEqual(events, ['apply', 'recover'])
})

test('undo and redo move history cursor only after successful replay', () => {
  const { store, history, engine } = harness()
  engine.execute({ origin: 'user', name: 'update' }, tx => {
    tx.update('a', block('a', 'next'))
  })

  assert.equal(engine.undo(), true)
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(history.canRedo, true)

  assert.equal(engine.redo(), true)
  assert.equal(store.get('a').data.text, 'next')
  assert.equal(history.canUndo, true)
})

test('failed undo leaves canonical state and history cursor unchanged', () => {
  let fail = false
  const projector = {
    prepare() {
      return {
        apply() { if (fail) throw new Error('projection failed') },
        recover() {},
      }
    },
  }
  const { store, history, engine } = harness({ projector })
  engine.execute({ origin: 'user', name: 'update' }, tx => {
    tx.update('a', block('a', 'next'))
  })

  fail = true
  assert.throws(() => engine.undo(), /projection failed/)
  assert.equal(store.get('a').data.text, 'next')
  assert.equal(history.canUndo, true)
  assert.equal(history.canRedo, false)
})

test('selection and observer failures are contained after canonical commit', () => {
  const diagnostics = []
  let captures = 0
  const { store, history, engine } = harness({
    selection: {
      capture() {
        captures++
        if (captures === 2) throw new Error('selection capture failed')
        return { anchor: { blockId: 'a', offset: 0 }, focus: { blockId: 'a', offset: 0 } }
      },
      restore() { throw new Error('selection restore failed') },
    },
    onCommit() { throw new Error('observer failed') },
    onDiagnostic(error) { diagnostics.push(error.message) },
  })

  engine.execute({ origin: 'user', name: 'update' }, tx => {
    tx.update('a', block('a', 'next'))
  })
  assert.equal(store.get('a').data.text, 'next')
  assert.equal(history.canUndo, true)
  assert.deepEqual(diagnostics, ['selection capture failed', 'observer failed'])

  engine.undo()
  assert.equal(store.get('a').data.text, 'a')
  assert.ok(diagnostics.includes('selection restore failed'))
})
