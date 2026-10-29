import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorViewModel } from './EditorViewModel.js'
import { InteractionState } from './InteractionState.js'

function harness({ canFocus = false, canPlaceCaret = true } = {}) {
  const calls = []
  const document = { activeElement: null }
  const elements = new Map(['a', 'b'].map(id => [id, {
    ownerDocument: document, contains(node) { return node === this },
  }]))
  const runtime = {
    health: 'ready',
    list: () => [{ id: 'a' }, { id: 'b' }],
    ids: () => ['a', 'b'],
    has: id => elements.has(id),
    indexOf: id => ['a', 'b'].indexOf(id),
  }
  const reconciler = {
    getElement: id => elements.get(id),
    focus(id) {
      calls.push('focus')
      if (canFocus) document.activeElement = elements.get(id)
      return canFocus
    },
  }
  const interaction = new InteractionState({ runtime, reconciler,
    onChange() { calls.push('current') },
  })
  const selection = {
    setCaret() { calls.push('setCaret'); return canPlaceCaret },
  }
  return { view: new EditorViewModel({ runtime, reconciler, interaction, selection }), calls }
}

test('rejected plugin focus does not move logical caret into an unrelated field', () => {
  const { view, calls } = harness()
  assert.equal(view.focus('b', { fieldKey: 'missing', offset: 2 }), false)
  assert.equal(view.currentId, 'a')
  assert.deepEqual(calls, ['focus'])
})

test('successful plugin focus preserves explicit caret placement', () => {
  const { view, calls } = harness({ canFocus: true })
  assert.equal(view.focus('b', { fieldKey: 'title', offset: 2 }), true)
  assert.equal(view.currentId, 'b')
  assert.deepEqual(calls, ['focus', 'setCaret', 'current'])
})

test('a failed logical caret placement is not reported as successful focus', () => {
  const { view, calls } = harness({ canFocus: true, canPlaceCaret: false })
  assert.equal(view.focus('b', { fieldKey: 'deleted', offset: 0 }), false)
  assert.equal(view.currentId, 'a')
  assert.deepEqual(calls, ['focus', 'setCaret'])
})

test('focus without an explicit caret does not attempt to set one', () => {
  const { view, calls } = harness({ canFocus: true })
  assert.equal(view.focus('b'), true)
  assert.deepEqual(calls, ['focus', 'current'])
})
