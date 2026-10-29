import test from 'node:test'
import assert from 'node:assert/strict'
import { InteractionState } from './InteractionState.js'

function harness(focusResult = false) {
  const ids = ['a', 'b']
  const events = []
  const runtime = {
    generation: 1,
    health: 'ready',
    list: () => ids.map(id => ({ id })),
    ids: () => [...ids],
    has: id => ids.includes(id),
    idAt: index => ids[index],
    indexOf: id => ids.indexOf(id),
  }
  let focusResultFn = () => focusResult
  const reconciler = { focus(id) { return focusResultFn(id) } }
  const state = new InteractionState({
    runtime, reconciler,
    onChange: event => events.push(event),
  })
  return {
    state, events,
    setFocusResult(fn) { focusResultFn = fn },
  }
}

test('failed focus does not change current block or emit a false current-block event', () => {
  const h = harness(false)
  assert.equal(h.state.currentId, 'a')
  assert.equal(h.state.focus('b'), false)
  assert.equal(h.state.currentId, 'a',
    'failed DOM focus changed active block despite returning false')
  assert.deepEqual(h.events, [])
})

test('successful focus changes current block and publishes one consistent event', () => {
  const h = harness(true)
  assert.equal(h.state.focus('b'), true)
  assert.equal(h.state.currentId, 'b')
  assert.equal(h.events.length, 1,
    'successful focus changed the active block without notifying its observers')
  assert.equal(h.events[0].previousCurrentId, 'a')
  assert.equal(h.events[0].currentId, 'b')
})

test('repeating focus on the same current block does not repeat change notifications', () => {
  const h = harness(true)
  assert.equal(h.state.focus('a'), true)
  assert.equal(h.state.currentId, 'a')
  assert.deepEqual(h.events, [])
})
