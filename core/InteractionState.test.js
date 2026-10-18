import test from 'node:test'
import assert from 'node:assert/strict'
import { InteractionState } from './InteractionState.js'

function fixture({ onChange, onError, focus } = {}) {
  const ids = ['a', 'b']
  const runtime = {
    generation: 1,
    modeEpoch: 0,
    readOnly: false,
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
  interaction = new InteractionState({ runtime, reconciler, onChange, onError })
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


test('a throwing interaction observer reports an error without reverting current block', () => {
  const errors = []
  const { interaction } = fixture({
    onChange() { throw new TypeError('current block callback failed') },
    onError(error) { errors.push(error.name, error.message) },
  })
  assert.doesNotThrow(() => interaction.setCurrent('b'))
  assert.equal(interaction.currentId, 'b')
  assert.deepEqual(errors, ['TypeError', 'current block callback failed'])
})

test('a rejected interaction observer reports asynchronously without leaking into control commands', async () => {
  const errors = []
  const { interaction } = fixture({
    onChange() { return Promise.reject(new RangeError('late selection event failed')) },
    onError(error) { errors.push(error.name, error.message) },
  })
  assert.doesNotThrow(() => interaction.select(['b']))
  assert.deepEqual(interaction.selectedIds, ['b'])
  for (let step = 0; step < 5; step++) await Promise.resolve()
  assert.deepEqual(errors, ['RangeError', 'late selection event failed'])
})


test('a read-only round trip during plugin focus revokes the old focus claim', () => {
  const { interaction, runtime } = fixture({
    focus(_id, _target, _controller, source) {
      source.readOnly = true
      source.modeEpoch++
      source.readOnly = false
      source.modeEpoch++
      return true
    },
  })
  interaction.setCurrent('b')
  assert.equal(interaction.focus('a'), false,
    'the retired focus claimed a newer read-only control epoch')
  assert.equal(interaction.currentId, 'b')
  assert.equal(runtime.readOnly, false)
})

test('a focus callback that enters read-only cannot claim another current block', () => {
  const { interaction, runtime } = fixture({
    focus(_id, _target, _controller, source) {
      source.readOnly = true
      source.modeEpoch++
      return true
    },
  })
  interaction.setCurrent('b')
  assert.equal(interaction.focus('a'), false)
  assert.equal(interaction.currentId, 'b')
  assert.equal(runtime.readOnly, true)
})

test('a nested current-block change from the interaction observer wins over earlier focus', () => {
  let interaction
  const events = []
  const h = fixture({
    onChange(change) {
      events.push(change.currentId)
      if (change.currentId === 'b') interaction.setCurrent('a')
    },
  })
  interaction = h.interaction
  assert.equal(interaction.focus('b'), false)
  assert.equal(interaction.currentId, 'a')
  assert.deepEqual(events, ['b', 'a'])
})


for (const health of ['destroyed', 'failed']) {
  test('retired ' + health + ' InteractionState never invokes plugin focus before rejecting', () => {
    const h = fixture({
      focus() { throw Error('retired plugin focus was invoked') },
    })
    h.runtime.health = health
    assert.equal(h.interaction.focus('b', { fieldKey: 'text' }), false)
    assert.deepEqual(h.calls, [])
    assert.equal(h.interaction.currentId, 'a')
  })
}
