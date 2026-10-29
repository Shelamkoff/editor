import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

import { HistoryStore } from './HistoryStore.js'

function record(id, before = 'a', after = 'b') {
  return {
    id,
    origin: 'user',
    name: 'edit',
    changes: [{
      kind: 'block.update',
      id: 'x',
      before: { id: 'x', type: 'paragraph', data: { text: before } },
      after: { id: 'x', type: 'paragraph', data: { text: after } },
    }],
    selectionBefore: null,
    selectionAfter: null,
  }
}

// Independent UTF-8 oracle: production uses TextEncoder, not Node's Buffer.
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8')

function undoRecords(history) {
  const records = []
  while (history.canUndo) {
    records.push(history.peekUndo())
    assert.equal(history.commitUndo(), true)
  }
  return records
}

test('history byte budget accepts only an omitted value or a positive safe integer', () => {
  for (const maxBytes of [0, -1, null, '100', 1.5, NaN, Infinity, -Infinity, 2 ** 53, true, false]) {
    assert.throws(() => new HistoryStore({ maxBytes }), {
      name: 'RangeError',
      message: 'History maxBytes must be a positive safe integer',
    })
  }
  for (const maxBytes of [undefined, 1, Number.MAX_SAFE_INTEGER]) {
    assert.doesNotThrow(() => new HistoryStore({ maxBytes }))
  }
})

test('history evicts oldest whole records at the exact serialized UTF-8 boundary', () => {
  const first = record(1, '', 'ASCII')
  const second = record(2, 'ASCII', 'Кириллица 日本語 🦎 e\u0301\u0000\ud800')
  second.metadata = { label: 'Событие', flags: [true, null, 3] }
  second.selectionAfter = { anchor: { blockId: 'x', offset: 11 }, direction: 'backward' }
  const total = bytes(first) + bytes(second)
  assert.ok(total > JSON.stringify(first).length + JSON.stringify(second).length)

  for (const [maxBytes, expected] of [[total, [second, first]], [total - 1, [second]]]) {
    const history = new HistoryStore({ maxBytes })
    history.push(first)
    history.push(second)
    assert.deepEqual(undoRecords(history), expected)
  }
})

test('newest oversized action remains whole and survives repeated Undo and Redo', () => {
  const history = new HistoryStore({ maxBytes: 1 })
  const newest = record(2, 'before', '🦎'.repeat(512))
  newest.changes.push({ kind: 'block.remove', id: 'other', before: { text: 'kept for undo' } })
  newest.selectionBefore = { blockId: 'x', offset: 3 }
  newest.selectionAfter = { blockId: 'x', offset: 7 }
  newest.metadata = { source: 'semantic gesture', opaque: ['retained', 42] }
  history.push(record(1))
  history.push(newest)
  assert.equal(history.undoDepth, 1)

  for (let iteration = 0; iteration < 5; iteration++) {
    const undo = history.prepareReplay('undo')
    assert.deepEqual(undo.record, newest)
    undo.commit()
    assert.equal(history.undoDepth, 0)
    assert.equal(history.redoDepth, 1)
    assert.deepEqual(history.peekRedo(), newest)
    const redo = history.prepareReplay('redo')
    assert.deepEqual(redo.record, newest)
    redo.commit()
    assert.equal(history.undoDepth, 1)
    assert.equal(history.redoDepth, 0)
  }
})

test('omitted or undefined byte budget keeps count-only behavior without serialization', t => {
  const stringify = t.mock.method(JSON, 'stringify', () => { throw new Error('unexpected serialization') })
  const encode = t.mock.method(TextEncoder.prototype, 'encode', () => { throw new Error('unexpected encoding') })
  try {
    for (const options of [{ maxStack: 2 }, { maxStack: 2, maxBytes: undefined }]) {
      const history = new HistoryStore(options)
      history.push(record(1, 'a', 'b'.repeat(4096)))
      history.push(record(2, 'b', 'c'))
      assert.equal(history.coalesce(record(3, 'c', 'd')), true)
      history.push(record(4, 'd', 'e'))
      assert.deepEqual(undoRecords(history).map(item => item.id), [4, 3])
      assert.equal(history.commitRedo(), true)
      assert.equal(history.commitRedo(), true)
    }
    assert.equal(stringify.mock.callCount(), 0)
    assert.equal(encode.mock.callCount(), 0)
  } finally {
    stringify.mock.restore()
    encode.mock.restore()
  }
})

test('enabled budget serializes each final candidate once, never in commit or replay', t => {
  const stringify = t.mock.method(JSON, 'stringify')
  const encode = t.mock.method(TextEncoder.prototype, 'encode')
  try {
    const history = new HistoryStore({ maxBytes: 100000, maxStack: 2 })
    history.push(record(1, 'a', 'b'))
    const coalesced = history.prepareRecord(record(2, 'b', 'c'), { coalesce: true })
    assert.equal(coalesced.coalesced, true)
    assert.equal(stringify.mock.callCount(), 2)
    assert.equal(encode.mock.callCount(), 2)
    coalesced.commit()
    coalesced.commit()
    history.push(record(3, 'c', 'd'))
    history.push(record(4, 'd', 'e'))
    assert.equal(stringify.mock.callCount(), 4)
    assert.equal(encode.mock.callCount(), 4)

    const undo = history.prepareReplay('undo')
    undo.commit()
    history.commitUndo()
    history.commitRedo()
    const redo = history.prepareReplay('redo')
    redo.commit()
    history.peekUndo()
    history.peekRedo()
    assert.equal(stringify.mock.callCount(), 4)
    assert.equal(encode.mock.callCount(), 4)
    assert.equal(history.undoDepth, 2)
  } finally {
    stringify.mock.restore()
    encode.mock.restore()
  }
})

test('budget observes owned JSON once and never invokes caller toJSON hooks', () => {
  const source = record(1, 'a', 'Снимок 🦎')
  const expected = record(1, 'a', 'Снимок 🦎')
  let reads = 0
  Object.defineProperty(source.changes[0].after.data, 'text', {
    enumerable: true,
    get() { reads++; return 'Снимок 🦎' },
  })
  Object.defineProperty(source, 'toJSON', {
    get() { throw new Error('caller toJSON must not be consulted') },
  })
  source.metadata = JSON.parse('{"__proto__":{"text":"данные"},"toJSON":"literal"}')
  expected.metadata = JSON.parse('{"__proto__":{"text":"данные"},"toJSON":"literal"}')
  const history = new HistoryStore({ maxBytes: bytes(expected) })
  history.push(source)
  assert.equal(reads, 1)
  assert.deepEqual(history.peekUndo(), expected)
  assert.equal(Object.hasOwn(history.peekUndo().metadata, '__proto__'), true)
  history.commitUndo()
  history.commitRedo()
  assert.equal(reads, 1)
  assert.deepEqual(history.peekUndo(), expected)
})

test('coalescence replaces the old cost with the complete merged action cost', () => {
  const older = record(1, '', 'older')
  const first = record(2, 'start', 'middle')
  const last = record(3, 'middle', 'Конец 🦎'.repeat(12))
  const merged = record(3, 'start', 'Конец 🦎'.repeat(12))
  first.selectionBefore = { blockId: 'x', offset: 2 }
  last.selectionAfter = { blockId: 'x', offset: 8 }
  merged.selectionBefore = { blockId: 'x', offset: 2 }
  merged.selectionAfter = { blockId: 'x', offset: 8 }
  const total = bytes(older) + bytes(merged)
  for (const [maxBytes, expected] of [[total, [merged, older]], [total - 1, [merged]]]) {
    const history = new HistoryStore({ maxBytes })
    history.push(older)
    history.push(first)
    const prepared = history.prepareRecord(last, { coalesce: true })
    assert.equal(prepared.coalesced, true)
    assert.equal(history.undoDepth, 2, 'preparation must not evict accepted records')
    prepared.commit()
    assert.deepEqual(undoRecords(history), expected)
  }
})

test('shrinking a coalesced action releases bytes for the next independent action', () => {
  const merged = record(2, 'a', 'c')
  const next = record(3, 'c', 'd')
  const history = new HistoryStore({ maxBytes: bytes(merged) + bytes(next) })
  history.push(record(1, 'a', 'large'.repeat(1000)))
  assert.equal(history.coalesce(record(2, 'large'.repeat(1000), 'c')), true)
  history.push(next)
  assert.deepEqual(undoRecords(history), [next, merged])
})

test('qualified async continuation is budgeted as one complete authoring action', () => {
  const older = record(1)
  const author = record(2)
  author.origin = 'plugin'
  author.name = 'block.update'
  author.changes[0].before.data = { url: 'old', title: '' }
  author.changes[0].after.data = { url: 'new', title: '' }
  const completion = record(3)
  completion.origin = 'async'
  completion.name = 'block.update'
  completion.changes[0].before.data = { url: 'new', title: '' }
  completion.changes[0].after.data = { url: 'new', title: 'Metadata 🦎'.repeat(15) }
  const merged = structuredClone(author)
  merged.id = 3
  merged.changes[0].after = structuredClone(completion.changes[0].after)
  const total = bytes(older) + bytes(merged)

  for (const [maxBytes, expected] of [[total, [merged, older]], [total - 1, [merged]]]) {
    const history = new HistoryStore({ maxBytes })
    history.push(older)
    history.push(author)
    const prepared = history.prepareRecord(completion, {
      continuation: { baseRevision: 2, blockId: 'x', fieldKey: 'url' },
    })
    assert.equal(prepared.coalesced, true)
    prepared.commit()
    assert.deepEqual(undoRecords(history), expected)
  }
})

test('a branched edit releases Redo costs without evicting affordable Undo actions', () => {
  const records = [record(1, 'a', 'b'), record(2, 'b', 'c'), record(3, 'c', 'd')]
  const replacement = record(4, 'b', 'branch')
  const history = new HistoryStore({ maxBytes: records.reduce((total, item) => total + bytes(item), 0) })
  for (const item of records) history.push(item)
  history.commitUndo()
  history.commitUndo()
  assert.equal(history.redoDepth, 2)
  history.push(replacement)
  assert.equal(history.redoDepth, 0)
  assert.deepEqual(undoRecords(history), [replacement, records[0]])
})

test('count eviction also removes old costs before the next byte-budget decision', () => {
  const first = record(1, 'a', 'large'.repeat(80))
  const later = [record(2), record(3), record(4), record(5)]
  const history = new HistoryStore({ maxStack: 2, maxBytes: bytes(first) + bytes(later[0]) })
  history.push(first)
  for (const item of later) history.push(item)
  assert.deepEqual(undoRecords(history), [later[3], later[2]])
  assert.equal(history.commitRedo(), true)
  assert.equal(history.commitRedo(), true)
  assert.equal(history.undoDepth, 2)
})

test('detached peeks and replay payloads cannot change retained records or their costs', () => {
  const first = record(1)
  const second = record(2)
  const history = new HistoryStore({ maxBytes: bytes(first) + bytes(second) })
  history.push(first)
  history.peekUndo().changes[0].after.data.text = 'huge'.repeat(1000)
  const undo = history.prepareReplay('undo')
  undo.record.changes[0].after.data.text = 'huge'.repeat(1000)
  undo.commit()
  history.peekRedo().changes[0].after.data.text = 'huge'.repeat(1000)
  const redo = history.prepareReplay('redo')
  redo.record.metadata = 'huge'.repeat(1000)
  redo.commit()
  history.push(second)
  assert.deepEqual(undoRecords(history), [second, first])
})

test('abandoned preparation cannot evict committed history or reserve bytes', () => {
  const first = record(1)
  const second = record(2)
  const history = new HistoryStore({ maxBytes: bytes(first) + bytes(second) })
  history.push(first)
  history.prepareRecord(record(3, 'a', 'abandoned'.repeat(1000)))
  assert.deepEqual(history.peekUndo(), first)
  assert.equal(history.undoDepth, 1)
  history.push(second)
  assert.deepEqual(undoRecords(history), [second, first])
})

test('failed encoding preserves both cursors and their accounting', t => {
  const first = record(1)
  const second = record(2)
  const third = record(3)
  const history = new HistoryStore({ maxBytes: bytes(first) + bytes(second) })
  history.push(first)
  history.push(second)
  history.commitUndo()
  const failure = new Error('UTF-8 allocation failed')
  const encode = t.mock.method(TextEncoder.prototype, 'encode', () => { throw failure })
  try {
    assert.throws(() => history.prepareRecord(third), error => error === failure)
  } finally {
    encode.mock.restore()
  }
  assert.equal(history.undoDepth, 1)
  assert.equal(history.redoDepth, 1)
  assert.deepEqual(history.peekUndo(), first)
  assert.deepEqual(history.peekRedo(), second)
  history.push(third)
  assert.equal(history.redoDepth, 0)
  assert.deepEqual(undoRecords(history), [third, first])
})

test('failed JSON ownership cannot change retained records or cached costs', () => {
  const first = record(1)
  const second = record(2)
  const history = new HistoryStore({ maxBytes: bytes(first) + bytes(second) })
  history.push(first)
  const cyclic = record(3)
  cyclic.metadata = cyclic
  assert.throws(() => history.push(cyclic), /circular/)
  history.push(second)
  assert.deepEqual(undoRecords(history), [second, first])
})

test('stale record and replay plans cannot change live byte accounting', () => {
  const records = [record(1), record(2), record(3), record(4)]
  const history = new HistoryStore({ maxBytes: bytes(records[0]) + bytes(records[1]) })
  history.push(records[0])
  const staleRecord = history.prepareRecord(record(5, 'a', 'stale'.repeat(500)))
  history.push(records[1])
  assert.throws(() => staleRecord.commit(), /stale/)
  assert.throws(() => staleRecord.commit(), /stale/)
  const staleUndo = history.prepareReplay('undo')
  history.push(records[2])
  assert.throws(() => staleUndo.commit(), /stale/)
  history.commitUndo()
  const staleRedo = history.prepareReplay('redo')
  history.push(records[3])
  assert.throws(() => staleRedo.commit(), /stale/)
  assert.equal(history.redoDepth, 0)
  assert.deepEqual(undoRecords(history), [records[3], records[1]])
})

test('clear resets byte accounting and invalidates prepared entries', () => {
  const first = record(1)
  const second = record(2)
  const history = new HistoryStore({ maxBytes: bytes(first) + bytes(second) })
  history.push(record(3, 'a', 'huge'.repeat(1000)))
  history.commitUndo()
  const stale = history.prepareReplay('redo')
  history.clear()
  assert.throws(() => stale.commit(), /stale/)
  history.push(first)
  history.push(second)
  assert.equal(history.redoDepth, 0)
  assert.deepEqual(undoRecords(history), [second, first])
})

test('rejected coalescence does not evict records or consume the byte budget', () => {
  const first = record(1)
  const second = record(2)
  const history = new HistoryStore({ maxBytes: bytes(first) + bytes(second) })
  history.push(first)
  assert.equal(history.coalesce(record(3, 'unrelated', 'large'.repeat(1000))), false)
  assert.deepEqual(history.peekUndo(), first)
  history.push(second)
  assert.deepEqual(undoRecords(history), [second, first])
})

test('successful record and replay commits apply their accounting only once', () => {
  const first = record(1)
  const second = record(2)
  const history = new HistoryStore({ maxBytes: bytes(first) + bytes(second) })
  const initial = history.prepareRecord(first)
  initial.commit()
  initial.commit()
  const undo = history.prepareReplay('undo')
  undo.commit()
  undo.commit()
  const redo = history.prepareReplay('redo')
  redo.commit()
  redo.commit()
  history.push(second)
  initial.commit()
  undo.commit()
  redo.commit()
  assert.deepEqual(undoRecords(history), [second, first])
})

test('byte budget option is captured once at construction', () => {
  let reads = 0
  const history = new HistoryStore({ get maxBytes() { reads++; return 1 } })
  history.push(record(1))
  history.push(record(2))
  history.commitUndo()
  history.commitRedo()
  assert.equal(reads, 1)
  assert.equal(history.undoDepth, 1)
})

for (const maxBytes of [1, 700, 2000]) {
  test(`retention matches a full serialized-record oracle across 1000 operations (budget ${maxBytes})`, () => {
    const history = new HistoryStore({ maxStack: 7, maxBytes })
    const undo = []
    const redo = []
    let seed = 0x51c0ffee
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
    for (let index = 1; index <= 1000; index++) {
      const action = random() % 12
      if (action < 7) {
        const next = record(index, 'prior', '🦎Я'.repeat(random() % 200))
        history.push(next)
        redo.length = 0
        undo.push(next)
        while (undo.length > 7) undo.shift()
        // Deliberately recompute the full retained size rather than mirroring
        // the production cache or its incremental accounting.
        while (undo.length > 1 && undo.reduce((total, item) => total + bytes(item), 0) > maxBytes) {
          undo.shift()
        }
      } else if (action === 7) {
        assert.equal(history.commitUndo(), undo.length > 0)
        if (undo.length) redo.push(undo.pop())
      } else if (action === 8) {
        assert.equal(history.commitRedo(), redo.length > 0)
        if (redo.length) undo.push(redo.pop())
      } else if (action === 9) {
        history.prepareRecord(record(index, 'ignored', 'abandoned'.repeat(500)))
      } else if (action === 10) {
        history.clear()
        undo.length = 0
        redo.length = 0
      }
      assert.equal(history.undoDepth, undo.length, `Undo depth at step ${index}`)
      assert.equal(history.redoDepth, redo.length, `Redo depth at step ${index}`)
      assert.equal(history.canUndo, undo.length > 0)
      assert.equal(history.canRedo, redo.length > 0)
      assert.deepEqual(history.peekUndo(), undo.at(-1))
      assert.deepEqual(history.peekRedo(), redo.at(-1))
      const retained = [...undo, ...redo]
      assert.ok(retained.length <= 1 || retained.reduce((total, item) => total + bytes(item), 0) <= maxBytes)
    }
    assert.deepEqual(undoRecords(history), [...undo].reverse())
  })
}
