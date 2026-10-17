import test from 'node:test'
import assert from 'node:assert/strict'
import { HistoryStore } from './HistoryStore.js'

const block = (id, url, title = '', description = '') => ({
  id, type: 'linkPreview', dataVersion: 1,
  data: { url, title, description, template: 'notion' },
})

const changed = (before, after) => ({
  kind: 'block.update', id: before.id, before, after,
})

function record(id, before, after, origin = 'native-input', name = 'native-input') {
  return {
    id, origin, name, changes: [changed(before, after)],
    selectionBefore: { blockId: before.id, fieldKey: 'url', offset: 0 },
    selectionAfter: { blockId: after.id, fieldKey: 'url', offset: after.data.url.length },
    historyGroup: 'native:url:gesture',
  }
}
const continuation = (revision, blockId = 'a', fieldKey = 'url') => ({
  baseRevision: revision, blockId, fieldKey,
})

test('async metadata can extend the immediately preceding URL edit as one Undo/Redo action', () => {
  const history = new HistoryStore()
  const before = block('a', 'https://before.example')
  const url = block('a', 'https://after.example')
  const enriched = block('a', 'https://after.example', 'Fetched title')
  const first = record(2, before, url)
  const second = record(3, url, enriched, 'external', 'block.update')
  history.push(first)
  const prepared = history.prepareRecord(second, { continuation: continuation(2) })
  assert.equal(prepared.coalesced, true)
  assert.equal(history.undoDepth, 1, 'preparing must not mutate the live history')
  prepared.commit()
  assert.equal(history.undoDepth, 1)
  const undo = history.prepareReplay('undo')
  assert.deepEqual(undo.record.changes[0].before, before)
  assert.deepEqual(undo.record.changes[0].after, enriched)
  assert.deepEqual(undo.record.selectionBefore, first.selectionBefore)
  assert.deepEqual(undo.record.selectionAfter, second.selectionAfter)
  undo.commit()
  assert.equal(history.undoDepth, 0)
  assert.equal(history.redoDepth, 1)
  history.commitRedo()
  assert.equal(history.undoDepth, 1)
})

test('interleaved actions on another block prevent URL metadata history continuation', () => {
  const history = new HistoryStore()
  const before = block('a', 'https://before.example')
  const url = block('a', 'https://after.example')
  const otherBefore = block('b', 'https://unrelated.example')
  const otherAfter = block('b', 'https://unrelated.example', 'Host change')
  const fetched = block('a', 'https://after.example', 'Fetched title')
  history.push(record(2, before, url))
  history.push(record(3, otherBefore, otherAfter, 'external', 'block.update'))
  const prepared = history.prepareRecord(record(4, url, fetched, 'external', 'block.update'),
    { continuation: continuation(2) })
  assert.equal(prepared.coalesced, false)
  prepared.commit()
  assert.equal(history.undoDepth, 3)
  assert.equal(history.peekUndo().changes[0].before.id, 'a')
})

test('a no-op URL edit or metadata operation changing URL cannot merge', () => {
  const input = block('a', 'https://same.example')
  const changedTitle = block('a', 'https://same.example', 'Author title')
  const metadata = block('a', 'https://same.example', 'Fetched title')
  for (const [firstBefore, firstAfter, secondAfter] of [
    [input, changedTitle, metadata],
    [block('a', 'https://before.example'), input, block('a', 'https://other.example')],
  ]) {
    const h = new HistoryStore()
    h.push(record(2, firstBefore, firstAfter))
    const outcome = h.prepareRecord(record(3, firstAfter, secondAfter, 'external', 'block.update'),
      { continuation: continuation(2) })
    assert.equal(outcome.coalesced, false)
    outcome.commit()
    assert.equal(h.undoDepth, 2)
  }
})

test('history continuation cannot merge after Undo, or with wrong token, field or block', () => {
  const before = block('a', 'https://before.example')
  const url = block('a', 'https://after.example')
  const enriched = block('a', 'https://after.example', 'Fetched title')
  for (const token of [
    continuation(1), continuation(2, 'b'), continuation(2, 'title'),
  ]) {
    const h = new HistoryStore()
    h.push(record(2, before, url))
    const prepared = h.prepareRecord(record(3, url, enriched, 'external', 'block.update'),
      { continuation: token })
    assert.equal(prepared.coalesced, false)
    prepared.commit()
    assert.equal(h.undoDepth, 2)
  }
  const history = new HistoryStore()
  history.push(record(2, before, url))
  history.commitUndo()
  const newer = history.prepareRecord(record(4, url, enriched, 'external', 'block.update'),
    { continuation: continuation(2) })
  assert.equal(newer.coalesced, false)
})

test('a continuation closes the old native typing group', () => {
  const before = block('a', 'https://before.example')
  const url = block('a', 'https://after.example')
  const enriched = block('a', 'https://after.example', 'Fetched title')
  const typed = block('a', 'https://after.example/x', 'Fetched title')
  const h = new HistoryStore()
  h.push(record(2, before, url))
  h.prepareRecord(record(3, url, enriched, 'external', 'block.update'),
    { continuation: continuation(2) }).commit()
  const followup = h.prepareRecord(record(4, enriched, typed), { coalesce: true })
  assert.equal(followup.coalesced, false,
    'future native edits must not silently join an already completed async action')
  followup.commit()
  assert.equal(h.undoDepth, 2)
})
