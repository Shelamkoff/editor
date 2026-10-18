import test from 'node:test'
import assert from 'node:assert/strict'

import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

test('prepared post-action selection is replayed instead of the menu or removed host selection', () => {
  const before = { anchor: { blockId: 'a', fieldKey: 'text', offset: 1 }, focus: { blockId: 'a', fieldKey: 'text', offset: 1 } }
  const after = { anchor: { blockId: 'b', fieldKey: 'text', offset: 0 }, focus: { blockId: 'b', fieldKey: 'text', offset: 0 } }
  const restored = []
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a')] })
  const engine = new TransactionEngine({ store, history: new HistoryStore(), selection: { capture: () => before, restore: value => restored.push(value) } })
  engine.execute({ origin: 'user', name: 'block.insert', selectionAfter: () => after }, tx => tx.insert(1, block('b')))
  engine.undo()
  assert.deepEqual(restored.at(-1), before)
  engine.redo()
  assert.deepEqual(restored.at(-1), after)
})

function block(id, text = id) {
  return { id, type: 'paragraph', data: { text } }
}

for (const failure of [null, undefined, false, 0, '', NaN]) {
  test('caught nested throw poisons the draft for ' + String(failure), () => {
    const { store, history, engine, projections } = harness()
    let caught = false
    let received
    try {
      engine.execute({ origin: 'user', name: 'outer' }, tx => {
        tx.update('a', block('a', 'outer'))
        try { engine.execute({ origin: 'user', name: 'nested' }, () => { throw failure }) } catch {}
        try { engine.execute({ origin: 'user', name: 'later' }, () => {}) } catch {}
      })
    } catch (error) { caught = true; received = error }
    assert.equal(caught, true)
    assert.ok(Object.is(received, failure))
    assert.equal(store.get('a').data.text, 'a')
    assert.equal(history.canUndo, false)
    assert.equal(store.revision, 0)
    assert.deepEqual(projections, [])
    assert.equal(engine.phase, 'idle')
    engine.execute({ origin: 'user', name: 'fresh' }, tx => tx.update('a', block('a', 'fresh')))
    assert.equal(store.get('a').data.text, 'fresh')
  })
}

test('native history uses the caret captured before the browser mutation and the committed caret for Redo', () => {
  const point = offset => ({ anchor: { blockId: 'a', fieldKey: 'text', offset }, focus: { blockId: 'a', fieldKey: 'text', offset } })
  const restored = []
  const store = new DocumentStore({ version: '2.0.0', blocks: [block('a', 'Alpha')] })
  const engine = new TransactionEngine({ store, history: new HistoryStore(), selection: { capture: () => point(3), restore: value => restored.push(value) } })
  const before = point(2)
  engine.execute({ origin: 'native-input', name: 'native-input', selectionBefore: before }, tx => tx.update('a', block('a', 'AlXpha')))
  before.anchor.offset = 99
  engine.undo()
  assert.deepEqual(restored.at(-1), point(2))
  engine.redo()
  assert.deepEqual(restored.at(-1), point(3))
})

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

test('async or accessor-backed transaction results abort the draft before publication', async () => {
  const { store, history, engine, projections } = harness()
  const delayed = Promise.resolve({ after: true })
  assert.throws(() => engine.execute({ origin: 'user', name: 'async-return' }, tx => {
    tx.update('a', block('a', 'should not commit'))
    return delayed
  }), /must complete synchronously/)
  await delayed
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(history.canUndo, false)
  assert.equal(engine.phase, 'idle')
  assert.deepEqual(projections, [])

  const hostile = Object.defineProperty({}, 'then', {
    get() { throw new Error('then accessor failed') },
  })
  assert.throws(() => engine.execute({ origin: 'user', name: 'hostile-return' }, tx => {
    tx.update('a', block('a', 'also should not commit'))
    return hostile
  }), /then accessor failed/)
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(engine.health, 'ready')

  engine.execute({ origin: 'user', name: 'fresh' }, tx => tx.update('a', block('a', 'healthy')))
  assert.equal(store.get('a').data.text, 'healthy')
})

test('a caught nested asynchronous result poisons its outer transaction', async () => {
  const { store, history, engine } = harness()
  const asynchronous = Promise.resolve('later')
  assert.throws(() => engine.execute({ origin: 'user', name: 'outer' }, tx => {
    tx.update('a', block('a', 'partial'))
    try {
      engine.execute({ origin: 'plugin', name: 'nested' }, () => asynchronous)
    } catch {}
    tx.update('a', block('a', 'later'))
  }), /must complete synchronously/)
  await asynchronous
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(history.canUndo, false)
  assert.equal(store.revision, 0)
  assert.equal(engine.phase, 'idle')
})

test('deferred Undo restore cannot steal an author caret movement at the same revision', async () => {
  const point = offset => ({
    anchor: { blockId: 'a', fieldKey: 'text', offset },
    focus: { blockId: 'a', fieldKey: 'text', offset },
  })
  let active = point(4)
  const restored = []
  const { engine, store } = harness({
    selection: {
      capture: () => active,
      restore(value) { active = value; restored.push(value.focus.offset) },
    },
  })
  engine.execute({ origin: 'user', name: 'change' }, tx => tx.update('a', block('a', 'modified')))
  assert.equal(engine.undo(), true)
  assert.equal(active.focus.offset, 4)
  const revision = store.revision
  active = point(2)
  await Promise.resolve()
  assert.equal(store.revision, revision, 'caret-only movement did not change the document')
  assert.equal(active.focus.offset, 2, 'a queued history callback must not reclaim user focus')
  assert.deepEqual(restored, [4])
})

test('Undo observer focus change survives deferred selection restoration', async () => {
  const point = offset => ({
    anchor: { blockId: 'a', fieldKey: 'text', offset },
    focus: { blockId: 'a', fieldKey: 'text', offset },
  })
  let active = point(5)
  const restored = []
  const { engine } = harness({
    selection: {
      capture: () => active,
      restore(value) { active = value; restored.push(value.focus.offset) },
    },
    onCommit(event) {
      if (event.action === 'undo') active = point(1)
    },
  })
  engine.execute({ origin: 'user', name: 'change' }, tx => tx.update('a', block('a', 'modified')))
  assert.equal(engine.undo(), true)
  assert.equal(active.focus.offset, 1)
  await Promise.resolve()
  assert.equal(active.focus.offset, 1)
  assert.deepEqual(restored, [5])
})


test('asynchronous transaction commit observers are assimilated exactly once and failures are contained', async () => {
  const reported = []
  let assimilations = 0
  const { store, history, engine } = harness({
    diagnostics: {
      now() { return 1 },
      threshold() { return Infinity },
      errorName(error) { return error?.name ?? 'UnknownError' },
      emit(code, details) { reported.push({ code, ...details }) },
    },
    onCommit() {
      return {
        then(_resolve, reject) {
          assimilations++
          reject(new TypeError('late commit observer rejected'))
        },
      }
    },
  })
  engine.execute({ origin: 'external', name: 'block.update' },
    tx => tx.update('a', block('a', 'Committed')))
  assert.equal(store.get('a').data.text, 'Committed')
  assert.equal(history.canUndo, true)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(assimilations, 1,
    'thenable observer rejection was ignored or the observer then method was read repeatedly')
  assert.deepEqual(reported.filter(event => event.operation === 'transaction.observer'), [
    { code: 'command.failed', operation: 'transaction.observer', errorName: 'TypeError' },
  ])
  assert.equal(engine.health, 'ready')
})

test('throwing observer then-accessor is contained after a committed transaction', async () => {
  const reported = []
  const { store, engine } = harness({
    diagnostics: {
      now() { return 1 },
      threshold() { return Infinity },
      errorName(error) { return error?.name ?? 'UnknownError' },
      emit(code, details) { reported.push({ code, ...details }) },
    },
    onCommit() {
      return {
        get then() { throw new Error('then getter failed') },
      }
    },
  })
  engine.execute({ origin: 'user', name: 'block.update' },
    tx => tx.update('a', block('a', 'Kept')))
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(store.get('a').data.text, 'Kept')
  assert.equal(engine.health, 'ready')
  assert.deepEqual(reported.filter(event => event.operation === 'transaction.observer'), [
    { code: 'command.failed', operation: 'transaction.observer', errorName: 'Error' },
  ])
})


test('native rejected commit observer Promise is contained after success', async () => {
  const diagnostics = []
  const { store, history, engine } = harness({
    diagnostics: {
      now() { return 1 },
      threshold() { return Infinity },
      errorName(error) { return error?.name ?? 'UnknownError' },
      emit(code, details) { diagnostics.push({ code, ...details }) },
    },
    async onCommit() {
      throw new RangeError('rejected after canonical commit')
    },
  })
  engine.execute({ origin: 'user', name: 'block.update' },
    tx => tx.update('a', block('a', 'Saved')))
  assert.equal(store.get('a').data.text, 'Saved')
  assert.equal(history.canUndo, true)
  for (let step = 0; step < 4; step++) await Promise.resolve()
  assert.deepEqual(diagnostics.filter(event => event.operation === 'transaction.observer'), [
    { code: 'command.failed', operation: 'transaction.observer', errorName: 'RangeError' },
  ])
  assert.equal(engine.health, 'ready')
})


test('selection capture before a command cannot author a second transaction', () => {
  let engine, armed = true, nestedWrites = 0, denied = null
  const { store, history, engine: created } = harness({
    selection: {
      capture() {
        if (armed) {
          armed = false
          try {
            engine.execute({ origin: 'external', name: 'unexpected-capture-write' }, tx => {
              nestedWrites++
              tx.update('a', block('a', 'Unexpected'))
            })
          } catch (error) { denied = error }
        }
        return null
      },
    },
  })
  engine = created
  engine.execute({ origin: 'user', name: 'ordinary-update' }, tx => tx.update('a', block('a', 'Accepted')))
  assert.equal(nestedWrites, 0, 'capture authored an independent committed edit before the command')
  assert.match(String(denied?.message), /capturing-selection/)
  assert.equal(store.get('a').data.text, 'Accepted')
  assert.equal(store.revision, 1)
  assert.equal(history.undoDepth, 1)
  engine.undo()
  assert.equal(store.get('a').data.text, 'a', 'Undo did not restore the actual pre-command document')
  assert.equal(engine.phase, 'idle')
})

for (const action of ['undo', 'redo']) {
  test('selection capture before ' + action + ' cannot change the history cursor or model', () => {
    let engine, armed = false, nestedWrites = 0, denied = null
    const { store, history, engine: created } = harness({
      selection: {
        capture() {
          if (armed) {
            armed = false
            try {
              engine.execute({ origin: 'external', name: 'unexpected-history-capture-write' }, tx => {
                nestedWrites++
                tx.update('a', block('a', 'Unexpected'))
              })
            } catch (error) { denied = error }
          }
          return null
        },
      },
    })
    engine = created
    engine.execute({ origin: 'user', name: 'ordinary-update' },
      tx => tx.update('a', block('a', 'Accepted')))
    if (action === 'redo') engine.undo()
    armed = true
    const beforeRevision = store.revision
    assert.equal(engine[action](), true)
    assert.equal(nestedWrites, 0, action + ' capture performed a second canonical authoring command')
    assert.match(String(denied?.message), /capturing-selection/)
    assert.equal(store.revision, beforeRevision + 1)
    assert.equal(store.get('a').data.text, action === 'undo' ? 'a' : 'Accepted')
    assert.equal(history.undoDepth, action === 'undo' ? 0 : 1)
    assert.equal(history.redoDepth, action === 'undo' ? 1 : 0)
    assert.equal(engine.phase, 'idle')
  })
}


test('destroy during pre-command selection capture cannot commit a new transaction', () => {
  let engine, armed = false
  const { store, history, projections, engine: created } = harness({
    selection: {
      capture() {
        if (armed) engine.destroy()
        return null
      },
    },
  })
  engine = created
  armed = true
  assert.throws(() => engine.execute({ origin: 'user', name: 'update' },
    tx => tx.update('a', block('a', 'Disallowed'))), /destroyed/)
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(store.revision, 0)
  assert.equal(history.canUndo, false)
  assert.deepEqual(projections, [])
})

test('destroy during history selection capture cannot replay committed history', () => {
  let engine, armed = false
  const { store, history, engine: created } = harness({
    selection: {
      capture() {
        if (armed) engine.destroy()
        return null
      },
    },
  })
  engine = created
  engine.execute({ origin: 'user', name: 'update' },
    tx => tx.update('a', block('a', 'Committed')))
  armed = true
  assert.throws(() => engine.undo(), /destroyed/)
  assert.equal(store.get('a').data.text, 'Committed')
  assert.equal(store.revision, 1)
  assert.equal(history.undoDepth, 1)
  assert.equal(history.redoDepth, 0)
})

test('projector teardown during apply cannot commit an already destroyed engine', () => {
  let engine, recoveries = 0
  const { store, history, engine: created } = harness({
    projector: {
      prepare() {
        return {
          apply() { engine.destroy() },
          recover() { recoveries++ },
          finalize() {},
          discard() {},
        }
      },
    },
  })
  engine = created
  assert.throws(() => engine.execute({ origin: 'user', name: 'update' },
    tx => tx.update('a', block('a', 'Disallowed'))), /destroyed/)
  assert.equal(recoveries, 1, 'aborted projection did not attempt prepared recovery')
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(store.revision, 0)
  assert.equal(history.canUndo, false)
})

test('selectionAfter teardown before commit leaves canonical model and history unchanged', () => {
  const { store, history, engine } = harness()
  assert.throws(() => engine.execute({
    origin: 'user',
    name: 'update',
    selectionAfter() {
      engine.destroy()
      return null
    },
  }, tx => tx.update('a', block('a', 'Disallowed'))), /destroyed/)
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(store.revision, 0)
  assert.equal(history.canUndo, false)
})


test('transaction metadata accessors cannot author a second transaction before dispatch', () => {
  const { engine, store, history } = harness()
  let reads = 0, nestedWrites = 0, denial = null
  const metadata = {
    origin: 'user',
    get name() {
      reads++
      try {
        engine.execute({ origin: 'external', name: 'hidden-meta-edit' }, tx => {
          nestedWrites++
          tx.update('a', block('a', 'Injected'))
        })
      } catch (error) { denial = error }
      return 'visible-edit'
    },
  }
  engine.execute(metadata, tx => tx.update('a', block('a', 'Accepted')))
  assert.equal(reads, 1, 'the command metadata name getter was read more than once')
  assert.equal(nestedWrites, 0, 'metadata getter committed an unrelated command')
  assert.match(String(denial?.message), /preparing-metadata/)
  assert.equal(store.get('a').data.text, 'Accepted')
  assert.equal(store.revision, 1)
  assert.equal(history.undoDepth, 1)
  engine.undo()
  assert.equal(store.get('a').data.text, 'a')
})

test('transaction command name is an owned one-read snapshot for history and events', () => {
  const emitted = []
  const { engine, store, history } = harness({ onCommit: event => emitted.push(event) })
  let reads = 0
  const metadata = {
    origin: 'user',
    get name() { return ++reads === 1 ? 'first-name' : 'changed-name' },
  }
  engine.execute(metadata, tx => tx.update('a', block('a', 'Next')))
  assert.equal(reads, 1, 'one command observed multiple names from external accessor')
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].name, 'first-name')
  assert.equal(store.get('a').data.text, 'Next')
  assert.equal(history.undoDepth, 1)
})


test('destroy inside a command prevents projector preparation and commit', () => {
  let engine, prepares = 0
  const { store, history, engine: created } = harness({
    projector: {
      prepare() {
        prepares++
        return { apply() {}, recover() {}, finalize() {}, discard() {} }
      },
    },
  })
  engine = created
  assert.throws(() => engine.execute({ origin: 'user', name: 'terminal-command' }, tx => {
    tx.update('a', block('a', 'Uncommitted'))
    engine.destroy()
  }), /destroyed/)
  assert.equal(prepares, 0, 'destroyed command invoked detached projector preparation')
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(store.revision, 0)
  assert.equal(history.canUndo, false)
  assert.equal(engine.phase, 'idle')
})

test('destroy inside a no-op command cannot report successful completion', () => {
  let engine
  const { store, history, engine: created } = harness()
  engine = created
  assert.throws(() => engine.execute({ origin: 'user', name: 'terminal-no-op' }, () => {
    engine.destroy()
    return 'misleading-success'
  }), /destroyed/)
  assert.equal(store.get('a').data.text, 'a')
  assert.equal(store.revision, 0)
  assert.equal(history.canUndo, false)
  assert.equal(engine.phase, 'idle')
})


test('command diagnostic clock cannot author a nested transaction before dispatch', () => {
  let engine, armed = true, nestedWrites = 0, denial = null
  const diagnostics = {
    now() {
      if (armed) {
        armed = false
        try {
          engine.execute({ origin: 'external', name: 'hidden-metric-write' }, tx => {
            nestedWrites++
            tx.update('a', block('a', 'Unexpected'))
          })
        } catch (error) { denial = error }
      }
      return 1
    },
    threshold() { return Infinity },
    errorName(error) { return error?.name ?? 'UnknownError' },
    emit() {},
  }
  const { engine: created, store, history } = harness({ diagnostics })
  engine = created
  engine.execute({ origin: 'user', name: 'intended' },
    tx => tx.update('a', block('a', 'Accepted')))
  assert.equal(nestedWrites, 0, 'diagnostic timestamp callback started a second canonical command')
  assert.match(String(denial?.message), /diagnostic-observation/)
  assert.equal(store.get('a').data.text, 'Accepted')
  assert.equal(store.revision, 1)
  assert.equal(history.undoDepth, 1)
})

test('slow-operation diagnostics cannot reenter authoring after the command commits', () => {
  let engine, injected = 0, denial = null, clock = 1
  const diagnostics = {
    now() { return clock++ },
    threshold() { return 0 },
    errorName(error) { return error?.name ?? 'UnknownError' },
    emit(code) {
      if (code !== 'command.slow') return
      try {
        engine.execute({ origin: 'external', name: 'metric-injection' }, tx => {
          injected++
          tx.update('a', block('a', 'Unexpected'))
        })
      } catch (error) { denial = error }
    },
  }
  const { engine: created, store, history } = harness({ diagnostics })
  engine = created
  engine.execute({ origin: 'user', name: 'intended' },
    tx => tx.update('a', block('a', 'Accepted')))
  assert.equal(injected, 0, 'slow diagnostic event synchronously authored a nested command')
  assert.match(String(denial?.message), /diagnostic-observation/)
  assert.equal(store.get('a').data.text, 'Accepted')
  assert.equal(store.revision, 1)
  assert.equal(history.undoDepth, 1)
})

test('throwing slow diagnostic cannot override an already committed transaction result', () => {
  let clock = 1
  const { engine, store, history } = harness({
    diagnostics: {
      now() { return clock++ },
      threshold() { return 0 },
      errorName(error) { return error?.name ?? 'UnknownError' },
      emit(code) { if (code === 'command.slow') throw Error('metrics observer is offline') },
    },
  })
  assert.equal(engine.execute({ origin: 'user', name: 'update' }, tx => {
    tx.update('a', block('a', 'Accepted'))
    return 'committed'
  }), 'committed', 'diagnostic emission replaced a successful canonical command result')
  assert.equal(store.get('a').data.text, 'Accepted')
  assert.equal(store.revision, 1)
  assert.equal(history.undoDepth, 1)
  assert.equal(engine.health, 'ready')
})
