import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorViewModel } from './EditorViewModel.js'
import { InteractionState } from './InteractionState.js'
import { LogicalSelection } from './LogicalSelection.js'

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


test('focus with a target does not claim success after newer caret ownership', () => {
  let h
  h = harness({
    caret() {
      h.interaction.setCurrent('c')
      return true
    },
  })
  assert.equal(h.view.focus('b', { fieldKey: 'text', offset: 1 }), false,
    'an old focus reported success after a newer current-block decision')
  assert.equal(h.view.currentId, 'c')
  assert.deepEqual(h.events, ['c'],
    'the superseded keyed focus must not publish an intermediate current-block event')
})

test('focus with a target does not claim success after read-only round trip in caret callback', () => {
  let h
  h = harness({
    caret() {
      h.runtime.readOnly = true
      h.runtime.modeEpoch++
      h.runtime.readOnly = false
      h.runtime.modeEpoch++
      return true
    },
  })
  assert.equal(h.view.focus('b', { fieldKey: 'text', offset: 1 }), false)
  assert.equal(h.runtime.readOnly, false)
})

test('focus with a target does not claim success after caret callback destroys the editor', () => {
  let h
  h = harness({
    caret() {
      h.runtime.health = 'destroyed'
      return true
    },
  })
  assert.equal(h.view.focus('b', { fieldKey: 'text', offset: 1 }), false)
})

test('focus with a stable caret target returns success and makes the focused block current', () => {
  const h = harness({ caret: () => true })
  assert.equal(h.view.focus('b', { fieldKey: 'text', offset: 'end' }), true)
  assert.equal(h.view.currentId, 'b')
})

test('a retained setCaret result does not reclaim a newer current-block decision', () => {
  let h
  h = harness({
    caret() {
      h.interaction.setCurrent('c')
      return true
    },
  })
  assert.equal(h.view.setCaret('b', { fieldKey: 'text', offset: 0 }), false)
  assert.equal(h.view.currentId, 'c')
  assert.deepEqual(h.events, ['c'])
})

test('setCaret refuses a callback that retires its owning runtime', () => {
  let h
  h = harness({
    caret() {
      h.runtime.health = 'destroyed'
      return true
    },
  })
  assert.equal(h.view.setCaret('b', { fieldKey: 'text', offset: 0 }), false)
  assert.equal(h.view.currentId, 'a')
  assert.deepEqual(h.events, [])
})


test('a same-block explicit author claim during insert supersedes automatic new-block focus', () => {
  const h = harness({
    insertCommit(interaction) {
      // No currentId change, but a later explicit focus intent still outranks
      // the insertion that is currently unwinding its commit observer.
      interaction.setCurrent('a')
    },
  })
  assert.equal(h.view.insert('paragraph', { text: 'New' }), 'new')
  assert.equal(h.view.currentId, 'a')
  assert.deepEqual(h.events, [])
})

test('a same-fallback explicit focus during block removal wins over the returned neighbor', () => {
  const h = harness({
    removeCommit(interaction) {
      interaction.reconcile()
      // Automatic fallback is "a". A newer author action explicitly
      // accepts that fallback, while the removed block's returned neighbor
      // is "c". The old removal must not steal current block back to "c".
      interaction.setCurrent('a')
    },
  })
  h.interaction.setCurrent('b')
  h.view.remove('b')
  assert.equal(h.view.currentId, 'a')
  assert.deepEqual(h.events, ['b', 'a'])
})

test('actual LogicalSelection missing keyed field cannot silently select another block', () => {
  const h = harness()
  const reconciler = {
    getElement() { return {} },
    resolveEditableTarget() { return null },
    getEditableFields() {
      return [{ key: 'text', mode: 'rich-text', element: { textContent: 'Hello' } }]
    },
  }
  const root = { ownerDocument: {} }
  const selection = new LogicalSelection({ root, reconciler })
  const view = new EditorViewModel({
    runtime: h.runtime, reconciler, interaction: h.interaction, selection,
  })
  assert.equal(view.setCaret('b', { fieldKey: 'retired-title', offset: 3 }), false)
  assert.equal(view.currentId, 'a')
  assert.deepEqual(h.events, [])
})


test('failed keyed focus does not publish a current-block change before the caret is accepted', () => {
  const h = harness({ caret: () => false })
  assert.equal(h.view.currentId, 'a')
  assert.equal(h.view.focus('b', { fieldKey: 'retired', offset: 0 }), false)
  assert.equal(h.view.currentId, 'a')
  assert.deepEqual(h.events, [],
    'failed native keyed focus had already published an incorrect block change')
})

test('actual LogicalSelection missing field cannot publish a false current-block focus', () => {
  const h = harness()
  const reconciler = {
    getElement() { return {} },
    resolveEditableTarget() { return null },
    getEditableFields() {
      return [{ key: 'text', mode: 'rich-text', element: { textContent: 'Hello' } }]
    },
    focus() { return true },
  }
  const logical = new LogicalSelection({
    root: { ownerDocument: {} },
    reconciler,
  })
  const view = new EditorViewModel({
    runtime: h.runtime, reconciler, interaction: h.interaction, selection: logical,
  })
  assert.equal(view.focus('b', { fieldKey: 'missing-title', offset: 2 }), false)
  assert.equal(view.currentId, 'a')
  assert.deepEqual(h.events, [])
})

test('successful keyed focus publishes the current block exactly once after caret acceptance', () => {
  let h, currentDuringCaret
  h = harness({
    caret() {
      currentDuringCaret = h.view.currentId
      return true
    },
  })
  assert.equal(h.view.focus('b', { fieldKey: 'text', offset: 1 }), true)
  assert.equal(currentDuringCaret, 'a',
    'current-block notification ran before native caret ownership was established')
  assert.equal(h.view.currentId, 'b')
  assert.deepEqual(h.events, ['b'])
})

test('focus without an explicit caret keeps normal plugin-only block focus behavior', () => {
  const h = harness({ caret: () => { throw Error('unexpected native caret call') } })
  assert.equal(h.view.focus('b'), true)
  assert.equal(h.view.currentId, 'b')
  assert.deepEqual(h.events, ['b'])
})


for (const health of ['destroyed', 'failed']) {
  test('retired ' + health + ' EditorViewModel cannot invoke a logical caret callback', () => {
    let carets = 0
    const h = harness({
      caret() { carets++; throw Error('retired DOM selection callback was invoked') },
    })
    h.runtime.health = health
    assert.equal(h.view.setCaret('b', { fieldKey: 'text', offset: 1 }), false)
    assert.equal(h.view.focus('b', { fieldKey: 'text', offset: 1 }), false)
    assert.equal(carets, 0)
    assert.equal(h.view.currentId, 'a')
    assert.deepEqual(h.events, [])
  })
}
