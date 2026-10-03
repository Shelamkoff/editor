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
  const history = options.history ?? new HistoryStore()
  const projections = []
  const projector = options.projector ?? {
    prepare(change) {
      projections.push(['prepare', change.draft.ids()])
      return {
        apply() { projections.push(['apply']) },
        recover() { projections.push(['recover']) },
        finalize() { projections.push(['finalize']) },
        discard() { projections.push(['discard']) },
      }
    },
  }
  const engine = new TransactionEngine({
    store,
    history,
    projector,
    selection: options.selection,
    onCommit: options.onCommit,
    diagnostics: options.diagnostics,
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
    ['finalize'],
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
        finalize() { events.push('finalize') },
        discard() { events.push('discard') },
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
  assert.deepEqual(events, ['apply', 'recover', 'discard'])
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
        finalize() {},
        discard() {},
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
  const events = []
  const diagnostics = {
    now() { return 1 },
    threshold() { return Infinity },
    errorName(error) { return error?.name ?? 'UnknownError' },
    emit(code, details) { events.push({ code, ...details }) },
  }
  let captures = 0
  const { store, history, engine } = harness({
    diagnostics,
    selection: {
      capture() {
        captures++
        if (captures === 2) throw new Error('selection capture failed')
        return { anchor: { blockId: 'a', offset: 0 }, focus: { blockId: 'a', offset: 0 } }
      },
      restore() { throw new Error('selection restore failed') },
    },
    onCommit() { throw new Error('observer failed') },
  })

  engine.execute({ origin: 'user', name: 'update' }, tx => {
    tx.update('a', block('a', 'next'))
  })
  assert.equal(store.get('a').data.text, 'next')
  assert.equal(history.canUndo, true)
  assert.equal(events.filter(event => event.operation === 'transaction.observer').length, 2)

  engine.undo()
  assert.equal(store.get('a').data.text, 'a')
  assert.ok(events.filter(event => event.operation === 'transaction.observer').length >= 3)
})


test('structured diagnostics report command failure and slow operations once', async () => {
  const events = []
  let clock = 10
  const diagnostics = {
    now() { return clock++ },
    threshold(name) { return name === 'commandMs' ? 0 : Infinity },
    errorName(error) { return error?.name ?? 'UnknownError' },
    emit(code, details) { events.push({ code, ...details }) },
  }
  const { engine } = harness({ diagnostics })

  assert.throws(() => engine.execute({ origin: 'user', name: 'broken-command' }, () => {
    throw new TypeError('boom')
  }), /boom/)

  assert.equal(events.filter(event => event.code === 'command.failed').length, 1)
  assert.equal(events.find(event => event.code === 'command.failed')?.operation, 'broken-command')
  assert.equal(events.find(event => event.code === 'command.failed')?.errorName, 'TypeError')
  assert.equal(events.filter(event => event.code === 'command.slow').length, 1)
})

test('contained observer failures use structured diagnostics without affecting the commit', () => {
  const events = []
  const diagnostics = {
    enabled: true,
    now() { return 1 },
    threshold() { return Infinity },
    errorName(error) { return error?.name ?? 'UnknownError' },
    emit(code, details) { events.push({ code, ...details }) },
  }
  const { store, engine } = harness({
    diagnostics,
    selection: {
      capture() { throw new Error('selection probe') },
    },
  })

  engine.execute({ origin: 'user', name: 'update' }, tx => {
    tx.update('a', block('a', 'next'))
  })

  assert.equal(store.get('a').data.text, 'next')
  assert.equal(events.some(event => (
    event.code === 'command.failed'
    && event.operation === 'transaction.observer'
    && event.errorName === 'Error'
  )), true)
})

test('single-block transaction never materializes the whole document', () => {
  const blocks = Array.from({ length: 1000 }, (_, index) => block(String(index)))
  const store = new DocumentStore({ version: '2.0.0', blocks })
  const history = new HistoryStore()
  const engine = new TransactionEngine({ store, history })

  store.export = () => {
    throw new Error('full export is forbidden in ordinary transactions')
  }

  engine.execute({ origin: 'user', name: 'single update' }, tx => {
    const current = tx.get('500')
    tx.update('500', {
      ...current,
      data: { text: 'changed' },
    })
  })

  assert.equal(store.get('500').data.text, 'changed')
  assert.equal(store.get('499').data.text, '499')
  assert.equal(history.canUndo, true)
})

test('history preparation failure after projection apply recovers before commit', () => {
  const events = []
  class FailingHistory extends HistoryStore {
    prepareRecord() { throw new Error('history prepare failed') }
  }
  const projector = {
    prepare() {
      return {
        apply() { events.push('apply') },
        recover() { events.push('recover') },
        finalize() { events.push('finalize') },
        discard() {},
      }
    },
  }
  const { store, engine } = harness({ history: new FailingHistory(), projector })
  const beforeRevision = store.revision

  assert.throws(() => engine.execute({ origin: 'user', name: 'update' }, tx => {
    tx.update('a', block('a', 'next'))
  }), /history prepare failed/)

  assert.equal(store.get('a').data.text, 'a')
  assert.equal(store.revision, beforeRevision)
  assert.equal(engine.health, 'ready')
  assert.deepEqual(events, ['apply', 'recover'])
})

test('recovery failure poisons the engine while committed model remains readable', () => {
  const projector = {
    prepare() {
      return {
        apply() { throw new Error('apply failed') },
        recover() { throw new Error('recover failed') },
        finalize() {},
        discard() {},
      }
    },
  }
  const { store, engine } = harness({ projector })
  assert.throws(() => engine.execute({ origin: 'user', name: 'update' }, tx => {
    tx.update('a', block('a', 'next'))
  }), /Projection failed and recovery also failed/)
  assert.equal(engine.health, 'failed')
  assert.equal(engine.phase, 'failed')
  assert.equal(store.get('a').data.text, 'a')
  assert.throws(
    () => engine.execute({ origin: 'user', name: 'later' }, () => {}),
    /TransactionEngine is failed/,
  )
})

test('committed event is direct immutable data with monotonic revision sequence', () => {
  const seen = []
  const { store, engine } = harness({ onCommit: event => seen.push(event) })
  engine.execute({ origin: 'user', name: 'first' }, tx => tx.update('a', block('a', 'one')))
  engine.execute({ origin: 'external', name: 'second' }, tx => tx.update('a', block('a', 'two')))

  assert.deepEqual(seen.map(event => event.sequence), [1, 2])
  assert.equal(store.revision, 2)
  assert.equal(seen[0].name, 'first')
  assert.equal(seen[0].action, 'commit')
  assert.equal(seen[0].changes[0].kind, 'block.update')
  assert.deepEqual(seen[0].history, { canUndo: true, canRedo: false })
  assert.equal(Object.isFrozen(seen[0]), true)
  assert.equal(Object.isFrozen(seen[0].changes), true)
})


test('undo publishes applied inverse changes in application order and redo publishes forward changes', () => {
  const seen = []
  const { engine } = harness({ onCommit: event => seen.push(event) })
  engine.execute({ origin: 'user', name: 'compound' }, tx => {
    tx.insert(1, block('b'))
    tx.update('a', block('a', 'next'))
  })

  seen.length = 0
  assert.equal(engine.undo(), true)
  assert.deepEqual(seen[0].changes.map(change => change.kind), ['block.update', 'block.remove'])
  assert.equal(seen[0].changes[0].before.data.text, 'next')
  assert.equal(seen[0].changes[0].after.data.text, 'a')
  assert.equal(seen[0].changes[1].block.id, 'b')

  seen.length = 0
  assert.equal(engine.redo(), true)
  assert.deepEqual(seen[0].changes.map(change => change.kind), ['block.insert', 'block.update'])
  assert.equal(seen[0].changes[1].before.data.text, 'a')
  assert.equal(seen[0].changes[1].after.data.text, 'next')
})


test('failed prepared commit restores the pre-command logical selection', () => {
  class FailingHistory extends HistoryStore {
    prepareRecord() { throw new Error('history prepare failed') }
  }
  let captures = 0
  const restored = []
  const before = { anchor: { blockId: 'a', offset: 1 }, focus: { blockId: 'a', offset: 1 } }
  const after = { anchor: { blockId: 'a', offset: 4 }, focus: { blockId: 'a', offset: 4 } }
  const { engine } = harness({
    history: new FailingHistory(),
    selection: {
      capture() { return captures++ === 0 ? before : after },
      restore(bookmark) { restored.push(bookmark) },
    },
  })

  assert.throws(() => engine.execute({ origin: 'user', name: 'update' }, tx => {
    tx.update('a', block('a', 'next'))
  }), /history prepare failed/)

  assert.deepEqual(restored, [before])
})

test('deferred history selection restore is guarded by committed revision', async () => {
  const restored = []
  const bookmark = { anchor: { blockId: 'a', offset: 1 }, focus: { blockId: 'a', offset: 1 } }
  const { engine } = harness({
    selection: {
      capture() { return bookmark },
      restore(value) { restored.push(value) },
    },
  })
  engine.execute({ origin: 'user', name: 'first' }, tx => tx.update('a', block('a', 'one')))
  restored.length = 0

  assert.equal(engine.undo(), true)
  assert.equal(restored.length, 1, 'undo did not restore selection synchronously')

  engine.execute({ origin: 'user', name: 'later' }, tx => tx.update('a', block('a', 'later')))
  await Promise.resolve()
  assert.equal(restored.length, 1, 'stale deferred selection overwrote a later revision')
})
