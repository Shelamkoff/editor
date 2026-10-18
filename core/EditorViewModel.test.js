import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorViewModel } from './EditorViewModel.js'
import { InteractionState } from './InteractionState.js'

function harness({ insertCommit = null, removeCommit = null, caret = () => true } = {}) {
  const ids = ['a', 'b', 'c']
  const events = []
  let interaction
  const runtime = {
    generation: 1,
    health: 'ready',
    modeEpoch: 0,
    readOnly: false,
    size: ids.length,
    list() { return ids.map(id => ({ id, type: 'paragraph', dataVersion: 1, data: { text: id } })) },
    ids() { return [...ids] },
    idAt(index) { return ids[index] },
    indexOf(id) { return ids.indexOf(id) },
    has(id) { return ids.includes(id) },
    get(id) { return this.list().find(item => item.id === id) },
    insert() {
      ids.push('new')
      this.size = ids.length
      insertCommit?.(interaction)
      return 'new'
    },
    remove(id) {
      const index = ids.indexOf(id)
      if (index < 0) throw new Error('unknown block')
      const nextId = ids[index + 1] ?? ids[index - 1] ?? null
      ids.splice(index, 1)
      this.size = ids.length
      removeCommit?.(interaction)
      return nextId
    },
  }
  const reconciler = {
    getElement() { return {} },
    getEditableFields() { return [] },
    focus() { return true },
  }
  interaction = new InteractionState({
    runtime, reconciler,
    onChange: event => events.push(event.currentId),
  })
  const selection = { setCaret: caret }
  const view = new EditorViewModel({ runtime, reconciler, interaction, selection })
  return { view, runtime, ids, interaction, events, selection }
}

test('insert does not reclaim a current block explicitly chosen during commit', () => {
  const h = harness({
    insertCommit(interaction) {
      interaction.reconcile()
      interaction.setCurrent('b')
    },
  })
  assert.equal(h.view.currentId, 'a')
  assert.equal(h.view.insert('paragraph', { text: 'New' }), 'new')
  assert.equal(h.view.currentId, 'b',
    'a committed insert overwrote a newer author current-block decision')
  assert.deepEqual(h.events, ['b'])
})

test('insert selects its new block when no newer current-block decision exists', () => {
  const h = harness()
  assert.equal(h.view.insert('paragraph', { text: 'New' }), 'new')
  assert.equal(h.view.currentId, 'new')
  assert.deepEqual(h.events, ['new'])
})

test('removing current block does not overwrite a newer author current-block decision', () => {
  const h = harness({
    removeCommit(interaction) {
      interaction.reconcile()
      interaction.setCurrent('c')
    },
  })
  assert.equal(h.view.currentId, 'a')
  h.view.remove('a')
  assert.equal(h.view.currentId, 'c',
    'removed-block fallback overwrote a newer author current-block decision')
  assert.deepEqual(h.events, ['b', 'c'])
})

test('removing current block claims its returned neighbor without a newer decision', () => {
  const h = harness({
    removeCommit(interaction) { interaction.reconcile() },
  })
  h.interaction.setCurrent('b')
  h.view.remove('b')
  assert.equal(h.view.currentId, 'c',
    'removing the current block did not choose the next surviving neighbor')
})

test('failed keyed setCaret leaves current block and selection ownership unchanged', () => {
  let attempts = 0
  const h = harness({
    caret() { attempts++; return false },
  })
  assert.equal(h.view.currentId, 'a')
  assert.equal(h.view.setCaret('b', { fieldKey: 'missing', offset: 2 }), false)
  assert.equal(attempts, 1)
  assert.equal(h.view.currentId, 'a',
    'failed native caret claim incorrectly made its destination current')
  assert.deepEqual(h.events, [])
})

test('successful keyed setCaret claims the block after native selection accepts', () => {
  const seen = []
  const h = harness({ caret(id, target) { seen.push([id, target]); return true } })
  assert.equal(h.view.setCaret('b', { fieldKey: 'text', offset: 1 }), true)
  assert.equal(h.view.currentId, 'b')
  assert.deepEqual(seen, [['b', { fieldKey: 'text', offset: 1 }]])
  assert.deepEqual(h.events, ['b'])
})
