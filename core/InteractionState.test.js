import test from 'node:test'
import assert from 'node:assert/strict'
import { InteractionState } from './InteractionState.js'

function fixture({ onChange, focus } = {}) {
  const ids = ['a', 'b']
  const runtime = {
    generation: 1,
    health: 'ready',
    list() { return ids.map(id => ({ id })) },
    ids() { return [...ids] },
    has(id) { return ids.includes(id) },
    indexOf(id) { return ids.indexOf(id) },
    idAt(index) { return ids[index] },
  }
  const calls = []
  let interaction
  const reconciler = {
    focus(id, target) {
      calls.push({ id, target })
      return focus ? focus(id, target, interaction, runtime) : true
    },
  }
  interaction = new InteractionState({ runtime, reconciler, onChange })
  return { interaction, runtime, calls }
}

test('a newer reentrant focus of another block keeps current-block ownership', () => {
  const events = []
  const { interaction, calls } = fixture({
    onChange: event => events.push(event),
    focus(id, _target, controller) {
      if (id === 'a') assert.equal(controller.focus('b'), true)
      return true
    },
  })
  assert.equal(interaction.currentId, 'a')
  assert.equal(interaction.focus('a'), false,
    'the superseded older focus incorrectly reported current ownership')
  assert.equal(interaction.currentId, 'b')
  assert.deepEqual(calls.map(call => call.id), ['a', 'b'])
  assert.deepEqual(events.map(event => event.currentId), ['b'])
})

test('a newer same-current-block focus still supersedes the older requested target', () => {
  const { interaction, calls } = fixture({
    focus(id, _target, controller) {
      if (id === 'a') assert.equal(controller.focus('b'), true)
      return true
    },
  })
  interaction.setCurrent('b')
  assert.equal(interaction.focus('a'), false,
    'a newer focus on the already-current block was overwritten by a stale focus')
  assert.equal(interaction.currentId, 'b')
  assert.deepEqual(calls.map(call => call.id), ['a', 'b'])
})

test('focus cannot claim a remounted same-ID occurrence after generation replacement', () => {
  const { interaction, runtime } = fixture({
    focus(_id, _target, _controller, source) {
      source.generation++
      return true
    },
  })
  interaction.setCurrent('b')
  assert.equal(interaction.focus('a'), false)
  assert.equal(interaction.currentId, 'b')
})

test('focus cannot claim an editor destroyed while its instance callback runs', () => {
  const { interaction, runtime } = fixture({
    focus(_id, _target, _controller, source) {
      source.health = 'destroyed'
      return true
    },
  })
  interaction.setCurrent('b')
  assert.equal(interaction.focus('a'), false)
  assert.equal(interaction.currentId, 'b')
})

test('ordinary focus claims the current block only on successful native owner focus', () => {
  const events = []
  const { interaction, calls } = fixture({ onChange: event => events.push(event) })
  assert.equal(interaction.focus('b', { fieldKey: 'text', offset: 2 }), true)
  assert.equal(interaction.currentId, 'b')
  assert.deepEqual(calls, [{ id: 'b', target: { fieldKey: 'text', offset: 2 } }])
  assert.deepEqual(events.map(event => event.currentId), ['b'])
})

test('a throwing change observer cannot turn a successful current-block change into a failed command', () => {
  const { interaction } = fixture({
    onChange() { throw new Error('application event listener failed') },
  })
  assert.doesNotThrow(() => interaction.setCurrent('b'))
  assert.equal(interaction.currentId, 'b')
  assert.equal(interaction.focus('a'), true)
  assert.equal(interaction.currentId, 'a')
})

test('a rejecting change observer is assimilated once after interaction has settled', async () => {
  let thenCalls = 0
  const { interaction } = fixture({
    onChange() {
      return {
        then(_resolve, reject) {
          thenCalls++
          reject(new TypeError('asynchronous event listener rejected'))
        },
      }
    },
  })
  interaction.setCurrent('b')
  assert.equal(interaction.currentId, 'b')
  for (let i = 0; i < 4; i++) await Promise.resolve()
  assert.equal(thenCalls, 1)
})
