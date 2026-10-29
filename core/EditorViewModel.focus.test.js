import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorViewModel } from './EditorViewModel.js'

function harness({ canFocus = false } = {}) {
  const calls = []
  const runtime = {
    health: 'ready',
    list: () => [],
    has: id => id === 'a',
    idAt: i => i === 0 ? 'a' : undefined,
  }
  let current = null
  const interaction = {
    get currentId() { return current },
    setCurrent(id) {
      calls.push('setCurrent')
      current = id
    },
    focus(id, target) {
      calls.push('focus')
      return canFocus
    },
  }
  const reconciler = { getElement: () => null }
  const selection = {
    setCaret(id, target) {
      calls.push('setCaret')
      return true
    },
  }
  return { view: new EditorViewModel({ runtime, reconciler, interaction, selection }), calls }
}

test('rejected plugin focus does not move logical caret into an unrelated field', () => {
  const { view, calls } = harness()
  assert.equal(view.focus('a', { fieldKey: 'missing', offset: 2 }), false)
  assert.deepEqual(calls, ['focus'],
    'failed focus still published a new logical caret')
})

test('successful plugin focus preserves explicit caret placement', () => {
  const { view, calls } = harness({ canFocus: true })
  assert.equal(view.focus('a', { fieldKey: 'title', offset: 2 }), true)
  assert.deepEqual(calls, ['focus', 'setCaret', 'setCurrent'])
})

test('a failed logical caret placement is not reported as successful focus', () => {
  const calls = []
  const runtime = { health: 'ready', has: id => id === 'a', list: () => [] }
  const interaction = {
    currentId: null,
    setCurrent() { calls.push('setCurrent') },
    focus() { calls.push('focus'); return true },
  }
  const selection = {
    setCaret() { calls.push('setCaret'); return false },
  }
  const view = new EditorViewModel({
    runtime, reconciler: { getElement() {} }, interaction, selection,
  })
  assert.equal(view.focus('a', { fieldKey: 'deleted', offset: 0 }), false)
  assert.deepEqual(calls, ['focus', 'setCaret'])
})

test('focus without an explicit caret does not attempt to set one', () => {
  const { view, calls } = harness({ canFocus: true })
  assert.equal(view.focus('a'), true)
  assert.deepEqual(calls, ['focus'])
})
