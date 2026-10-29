import test from 'node:test'
import assert from 'node:assert/strict'
import { InteractionState } from './InteractionState.js'

function fixture() {
  const document = { activeElement: null }
  const elements = new Map(['a', 'b', 'c'].map(id => [id, {
    id, ownerDocument: document,
    contains(node) { return node === this },
  }]))
  const runtime = {
    health: 'ready', generation: 1, revision: 1, modeEpoch: 0, readOnly: false,
    ids: () => [...elements.keys()], has: id => elements.has(id),
    list: () => [...elements.keys()].map(id => ({ id })),
    indexOf: id => [...elements.keys()].indexOf(id),
  }
  const events = []
  let position = null
  const reconciler = {
    getElement: id => elements.get(id),
    resolveBlockTarget: node => elements.get(node?.id) === node ? node.id : null,
    focus(id) { document.activeElement = elements.get(id); return true },
  }
  const selection = {
    capture: () => null,
    setCaret(id, target) { document.activeElement = elements.get(id); position = target.offset; return true },
  }
  const state = new InteractionState({ runtime, reconciler,
    onChange: event => events.push({ id: event.currentId, position }),
  })
  return { document, elements, runtime, reconciler, selection, state, events }
}

test('one focus intent secures the requested caret before publishing its current block', () => {
  const h = fixture()
  assert.equal(h.state.focus('b', { fieldKey: 'text', offset: 2 }, { selection: h.selection }), true)
  assert.deepEqual(h.events, [{ id: 'b', position: 2 }])
})

test('native acknowledgment from the requested occurrence stays provisional through caret placement', () => {
  const h = fixture()
  const focus = h.reconciler.focus
  h.reconciler.focus = id => {
    focus(id)
    h.state.observeNativeFocus(h.elements.get(id))
    assert.equal(h.state.currentId, 'a', 'native focus published before its logical caret')
    return true
  }
  const caret = h.selection.setCaret
  h.selection.setCaret = (id, target) => {
    h.state.observeNativeFocus(h.elements.get(id))
    return caret(id, target)
  }
  assert.equal(h.state.focus('b', { fieldKey: 'text', offset: 2 }, { selection: h.selection }), true)
  assert.deepEqual(h.events, [{ id: 'b', position: 2 }])
})

test('a successor from an accepted focus event cannot retroactively reject that accepted focus', () => {
  const h = fixture()
  const state = new InteractionState({ runtime: h.runtime, reconciler: h.reconciler,
    onChange(event) { if (event.currentId === 'b') state.setCurrent('c') },
  })
  assert.equal(state.focus('b'), true)
  assert.equal(state.currentId, 'c')
})

test('rejected focus cannot restore a bookmark into a replacement previous field', () => {
  const h = fixture()
  const fields = new Map([['a', { key: 'text', mode: 'plain-text', element: {} }]])
  const point = { blockId: 'a', fieldKey: 'text', offset: 2 }
  let restores = 0
  h.selection.capture = () => ({ anchor: point, focus: { ...point } })
  h.selection.restore = () => { restores++; return true }
  h.reconciler.getEditableFields = id => fields.has(id) ? [fields.get(id)] : []
  h.reconciler.focus = () => {
    fields.set('a', { key: 'text', mode: 'plain-text', element: {} })
    return false
  }
  assert.equal(h.state.focus('b', { fieldKey: 'missing', offset: 2 }, { selection: h.selection }), false)
  assert.equal(restores, 0, 'a replaced field inherited the old restoration authority')
})

test('nonfinite or nonnumeric caret offsets reject before any presentation effects', () => {
  for (const offset of [NaN, Infinity, -Infinity, '2', null, {}, true]) {
    const h = fixture()
    let calls = 0
    h.reconciler.focus = () => { calls++; return true }
    h.selection.setCaret = () => { calls++; return true }
    assert.equal(h.state.focus('b', { offset }, { selection: h.selection }), false)
    assert.equal(calls, 0)
    assert.equal(h.state.currentId, 'a')
  }
})

test('an explicit block-selection decision supersedes pending focus before publication', () => {
  const h = fixture()
  h.selection.setCaret = () => { h.state.select(['c']); return true }
  assert.equal(h.state.focus('b', { offset: 2 }, { selection: h.selection }), false)
  assert.equal(h.state.currentId, 'a')
  assert.deepEqual(h.state.selectedIds, ['c'])
})

test('a plugin callback without actual focus cannot publish a successful focus claim', () => {
  const h = fixture()
  h.reconciler.focus = () => true
  assert.equal(h.state.focus('b'), false)
  assert.equal(h.state.currentId, 'a')
  assert.deepEqual(h.events, [])
})

for (const destination of ['c', 'foreign']) {
  test(`native focus to ${destination} supersedes a pending request without restoring its old selection`, () => {
    const h = fixture()
    let carets = 0, restores = 0
    h.reconciler.focus = () => {
      const element = h.elements.get(destination) ?? { id: destination }
      h.document.activeElement = element
      h.state.observeNativeFocus(element)
      return true
    }
    h.selection.setCaret = () => { carets++; return true }
    h.selection.restore = () => { restores++; return true }
    assert.equal(h.state.focus('b', { offset: 2 }, { selection: h.selection }), false)
    assert.equal(carets, 0)
    assert.equal(restores, 0)
    assert.equal(h.state.currentId, destination === 'c' ? 'c' : 'a')
    assert.equal(h.document.activeElement.id, destination)
  })
}

test('native focus of a same-ID replacement is a new occurrence, not an acknowledgment', () => {
  const h = fixture()
  let carets = 0
  h.reconciler.focus = id => {
    const successor = { ...h.elements.get(id) }
    h.elements.set(id, successor)
    h.document.activeElement = successor
    h.state.observeNativeFocus(successor)
    return true
  }
  h.selection.setCaret = () => { carets++; return true }
  assert.equal(h.state.focus('b', { offset: 2 }, { selection: h.selection }), false)
  assert.equal(carets, 0)
  assert.equal(h.state.currentId, 'b')
})

test('an unsuccessful newer focus still supersedes the older intent', () => {
  const h = fixture()
  h.reconciler.focus = id => {
    if (id === 'b') {
      assert.equal(h.state.focus('c'), false)
      h.document.activeElement = h.elements.get(id)
      return true
    }
    return false
  }
  assert.equal(h.state.focus('b'), false)
  assert.equal(h.state.currentId, 'a')
})

test('an empty optional target does not introduce an unsolicited caret reset', () => {
  const h = fixture()
  h.selection.setCaret = () => { throw new Error('unsolicited caret') }
  assert.equal(h.state.focus('b', {}, { selection: h.selection }), true)
})

test('a rejected keyed request restores its prior native owner without publishing intermediate current', () => {
  const h = fixture()
  const point = { blockId: 'a', fieldKey: 'text', offset: 2 }
  const fields = new Map([...h.elements].map(([id, element]) => [id, { key: 'text', mode: 'plain-text', element }]))
  h.document.activeElement = h.elements.get('a')
  h.selection.capture = () => ({ anchor: point, focus: { ...point } })
  h.reconciler.getEditableFields = id => [fields.get(id)]
  const focus = h.reconciler.focus
  h.reconciler.focus = id => { focus(id); h.state.observeNativeFocus(h.elements.get(id)); return true }
  h.selection.setCaret = () => false
  let restored
  h.selection.restore = bookmark => {
    h.document.activeElement = h.elements.get('a')
    h.state.observeNativeFocus(h.elements.get('a'))
    restored = bookmark
    return true
  }
  assert.equal(h.state.focus('b', { fieldKey: 'missing', offset: 1 }, { selection: h.selection }), false)
  assert.deepEqual(restored, { anchor: point, focus: point })
  assert.equal(h.document.activeElement, h.elements.get('a'))
  assert.equal(h.state.currentId, 'a')
  assert.deepEqual(h.events, [])
})

test('a delayed native focus notification cannot overwrite a newer active owner', () => {
  const h = fixture()
  h.document.activeElement = h.elements.get('c')
  h.state.observeNativeFocus(h.elements.get('c'))
  h.state.observeNativeFocus(h.elements.get('b'))
  assert.equal(h.state.currentId, 'c')
  assert.deepEqual(h.events.map(event => event.id), ['c'])
})
