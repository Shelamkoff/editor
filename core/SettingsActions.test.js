import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareSettingsActions } from './SettingsActions.js'

const label = (key, fallback = key) => ({ key, fallback })
const context = { ownerDocument: {}, t: value => value.fallback }
const runtime = { prepareExtensionValue: operation => operation() }
const prepare = (actions, overrides = {}) => prepareSettingsActions(runtime, {
  kind: 'actions', actions: () => actions, apply: data => data, ...overrides,
}, {}, context, label('group', 'Block actions'))

test('compact display comes from action metadata, not from interpreting its opaque ID', () => {
  const prepared = prepare([
    { id: 'layout:wide', label: label('wide', 'Use a wide layout'), compactLabel: label('wideCompact', 'Wide'), active: true },
    { id: 'h2', label: label('notHeading', 'A custom action') },
  ])
  assert.equal(prepared.label, 'Block actions')
  assert.equal(prepared.actions[0].compactLabel, 'Wide')
  assert.equal(prepared.actions[0].label, 'Use a wide layout')
  assert.equal(prepared.actions[1].compactLabel ?? prepared.actions[1].label, 'A custom action')
})

test('a malformed late action rejects the whole group instead of returning a partial menu', () => {
  assert.throws(() => prepare([
    { id: 'valid', label: label('first') },
    { id: 'invalid', label: label('second'), compactLabel: { key: '', fallback: 'Bad' } },
  ]), /compactLabel/)
})

test('captures label accessors once inside preparation and detaches the complete result', () => {
  let preparing = false
  const reads = new Map()
  const access = (key, value) => {
    assert.equal(preparing, true, `${key} was read outside preparation`)
    reads.set(key, (reads.get(key) ?? 0) + 1)
    return value
  }
  const raw = {
    get id() { return access('id', 'custom:one') },
    get label() { return access('label', { get key() { return access('label.key', 'full') }, get fallback() { return access('label.fallback', 'Full label') } }) },
    get compactLabel() { return access('compactLabel', { get key() { return access('compact.key', 'compact') }, get fallback() { return access('compact.fallback', 'Short') } }) },
    get icon() { return access('icon', '<i></i>') },
    get active() { return access('active', false) },
    get disabled() { return access('disabled', true) },
  }
  const guarded = { prepareExtensionValue(operation) { preparing = true; try { return operation() } finally { preparing = false } } }
  const result = prepareSettingsActions(guarded, { actions: () => [raw], apply: data => data }, {}, context, label('group'))
  assert.deepEqual(result.actions, [{ id: 'custom:one', label: 'Full label', compactLabel: 'Short', icon: '<i></i>', active: false, disabled: true }])
  assert.equal([...reads.values()].every(count => count === 1), true)
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.actions), true)
  assert.equal(Object.isFrozen(result.actions[0]), true)
})

test('mutating extension-owned metadata after capture cannot redirect a rendered action', () => {
  const action = { id: 'first', label: label('full', 'Original'), compactLabel: label('short', 'O') }
  const prepared = prepare([action])
  action.id = 'replacement'
  action.label.fallback = 'Changed'
  action.compactLabel.fallback = 'C'
  assert.deepEqual(prepared.actions[0], { id: 'first', label: 'Original', compactLabel: 'O' })
})

test('apply is captured with its receiver and reads current author data only at invocation', () => {
  let calls = 0
  const capability = {
    actions() { assert.equal(this, capability); return [{ id: 'mode::wide', label: label('wide') }] },
    apply(data, id, operationContext) {
      assert.equal(this, capability)
      calls++
      return { ...data, mode: id, item: operationContext.createId('item') }
    },
  }
  const prepared = prepareSettingsActions(runtime, capability, { text: 'old' }, context, label('group'))
  capability.apply = () => { throw new Error('late reassignment must not redirect the action') }
  const result = prepared.apply({ text: 'current author value' }, prepared.actions[0].id, { createId: prefix => `${prefix}-1` })
  assert.deepEqual(result, { text: 'current author value', mode: 'mode::wide', item: 'item-1' })
  assert.equal(calls, 1)
})

test('dense indexed capture cannot be bypassed by overridden array methods or iteration', () => {
  const source = [{ id: '__proto__', label: label('a') }, { id: 'constructor', label: label('b') }]
  source.map = () => { throw new Error('caller map must not run') }
  source[Symbol.iterator] = () => { throw new Error('caller iterator must not run') }
  assert.deepEqual(prepare(source).actions.map(action => action.id), ['__proto__', 'constructor'])
  const sparse = []
  sparse[1] = { id: 'gap', label: label('gap') }
  assert.throws(() => prepare(sparse), /dense array/)
  assert.throws(() => prepare([{ id: 'same', label: label('x') }, { id: 'same', label: label('y') }]), /unique/)
})

for (const [property, value, expected] of [
  ['id', '', /IDs/], ['id', 1, /IDs/],
  ['label', null, /label/], ['label', { key: 'x', fallback: 7 }, /label/],
  ['compactLabel', null, /compactLabel/], ['compactLabel', { key: 'x' }, /compactLabel/],
  ['icon', 1, /icon/], ['active', 'true', /active/], ['disabled', 0, /disabled/],
]) {
  test(`rejects invalid ${property} metadata instead of coercing it`, () => {
    assert.throws(() => prepare([{ id: 'action', label: label('valid'), [property]: value }]), expected)
  })
}

test('group labels and translations are validated before returning the presentation', () => {
  assert.throws(() => prepare([], { label: { key: '', fallback: 'Broken' } }), /group label/)
  assert.throws(() => prepareSettingsActions(runtime, { actions: () => [], apply: d => d }, {}, { ...context, t: () => 7 }, label('group')), /translation/)
  const result = prepare([], { label: label('customGroup', 'Actions') })
  assert.deepEqual(result.actions, [])
  assert.equal(result.label, 'Actions')
})

test('an action or metadata getter cannot enter a document producer during preparation', () => {
  let preparing = false
  let producers = 0
  const guarded = {
    prepareExtensionValue(operation) { preparing = true; try { return operation() } finally { preparing = false } },
    update(producer) { if (preparing) throw new Error('extension preparation'); producers++; producer() },
  }
  for (const factory of [
    () => { guarded.update(() => {}); return [] },
    () => [{ id: 'x', label: label('x'), get compactLabel() { guarded.update(() => {}); return label('short') } }],
  ]) {
    assert.throws(() => prepareSettingsActions(guarded, { actions: factory, apply: d => d }, {}, context, label('group')), /extension preparation/)
  }
  assert.equal(producers, 0)
})

test('a failing action producer propagates its original failure without returning a partial group', () => {
  const failure = new Error('actions failed')
  assert.throws(() => prepare([], { actions() { throw failure } }), error => error === failure)
})

test('async action lists and async metadata are rejected with later rejections contained', async () => {
  assert.throws(() => prepare([], { actions: () => Promise.reject(new Error('late list rejection')) }), /synchronously/)
  assert.throws(() => prepare([{ id: 'x', label: label('x'), compactLabel: Promise.reject(new Error('late label rejection')) }]), /synchronously/)
  const thenable = Object.assign(() => {}, { then(_resolve, reject) { reject(new Error('callable rejection')) } })
  assert.throws(() => prepare([], { actions: () => thenable }), /synchronously/)
  await new Promise(resolve => setImmediate(resolve))
})

test('invalid array length from a proxy is rejected before indexed metadata is read', () => {
  let inspected = 0
  for (const length of [-1, 0.5, NaN]) {
    const value = new Proxy([], { get(target, property, receiver) {
      if (property === 'length') return length
      if (property === '0') inspected++
      return Reflect.get(target, property, receiver)
    } })
    assert.throws(() => prepare(value), /length/)
  }
  assert.equal(inspected, 0)
})

test('a rejected label is contained before any later metadata getter can fail', async () => {
  let laterReads = 0
  const source = {
    id: 'x', label: label('x'),
    get compactLabel() { return Promise.reject(new Error('early rejected label')) },
    get active() { laterReads++; throw new Error('later getter must not run') },
  }
  assert.throws(() => prepare([source]), /synchronously/)
  assert.equal(laterReads, 0)
  await new Promise(resolve => setImmediate(resolve))
})
