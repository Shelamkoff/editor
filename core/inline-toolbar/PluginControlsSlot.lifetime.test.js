import assert from 'node:assert/strict'
import test from 'node:test'
import { PluginControlsSlot } from './PluginControlsSlot.js'

function fixture() {
  const frames = []
  const zone = {
    ownerDocument: { defaultView: { requestAnimationFrame(callback) { frames.push(callback) } } },
    children: [],
    appendChild(element) { this.children.push(element); element.parent = this },
  }
  const element = () => ({ remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1)
    this.parent = null
  } })
  const divider = { style: {} }
  const state = { contexts: [], groups: [], suppression: [], mutations: 0, commits: 0, replacements: 0, updates: 0 }
  let block = { id: 'a', type: 'heading', contentElement: {},
    replaceContentElement(next) { state.replacements++; this.contentElement = next } }
  let renderer = (_element, context) => {
    state.contexts.push(context)
    const group = { elements: [element()], destroyed: 0, destroy() { this.destroyed++ } }
    state.groups.push(group)
    return group
  }
  const slot = new PluginControlsSlot(zone, divider, {
    blocks: { getCurrentBlock: () => block, getBlockById: id => block?.id === id ? block : undefined },
    getInlineControls: () => (...args) => renderer(...args), events: {},
    typeSelector: { update() { state.updates++ } },
    setSuppressSelectionChange(value) { state.suppression.push(value) },
    mutations: { active: false, runForBlock(_block, operation) { state.mutations++; return operation() },
      commitExternal() { state.commits++ } },
  })
  return { slot, state, zone, divider, frames, element,
    renderWith(value) { renderer = value }, replaceBlock() { block = { ...block, contentElement: {} } } }
}

test('cleared block controls cannot invoke commands, replace content or suppress selection', () => {
  const { slot, state } = fixture()
  slot.refresh()
  const old = state.contexts[0]
  slot.clear()
  let called = 0
  assert.equal(old.mutate(() => ++called), undefined)
  old.onContentElementChanged({})
  old.suppressSelectionChange()
  assert.equal(called, 0)
  assert.equal(state.mutations, 0)
  assert.equal(state.replacements, 0)
  assert.equal(state.commits, 0)
  assert.equal(state.updates, 0)
  assert.deepEqual(state.suppression, [])
})

test('refresh retires the previous control context while live controls keep their return values', () => {
  const { slot, state } = fixture()
  slot.refresh(); slot.refresh()
  assert.equal(state.contexts[0].mutate(() => 'stale'), undefined)
  assert.equal(state.contexts[1].mutate(() => 42), 42)
  state.contexts[1].onContentElementChanged({})
  assert.equal(state.contexts[1].mutate(() => 43), 43, 'legitimate content replacement must not revoke the group')
  assert.equal(state.replacements, 1)
  assert.equal(state.groups[0].destroyed, 1)
})

test('same-id reconstruction does not revive block control mutation contexts', () => {
  const { slot, state, replaceBlock } = fixture()
  slot.refresh(); replaceBlock()
  assert.equal(state.contexts[0].mutate(() => 'stale'), undefined)
  state.contexts[0].onContentElementChanged({})
  assert.equal(state.replacements, 0)
  assert.equal(state.commits, 0)
})

test('reentrant control cleanup disposes the previous group exactly once', () => {
  const { slot, state, zone } = fixture()
  slot.refresh()
  const old = state.groups[0]
  old.destroy = function () { this.destroyed++; if (this.destroyed === 1) slot.clear() }
  assert.doesNotThrow(() => slot.clear())
  assert.equal(old.destroyed, 1)
  assert.equal(zone.children.length, 0)
})

test('a newer group opened by cleanup is not removed or overwritten by the outer refresh', () => {
  const { slot, state, zone } = fixture()
  slot.refresh()
  const first = state.groups[0]
  first.destroy = function () { this.destroyed++; if (this.destroyed === 1) slot.refresh() }
  assert.doesNotThrow(() => slot.refresh())
  assert.equal(first.destroyed, 1)
  assert.equal(state.groups.length, 2)
  assert.deepEqual(zone.children, state.groups[1].elements)
  assert.equal(state.contexts[1].mutate(() => 42), 42)
})

test('empty, null and failed block controls revoke the context and release unused groups', () => {
  for (const mode of ['empty', 'null', 'throw']) {
    const { slot, renderWith, state } = fixture()
    let captured, disposed = 0
    renderWith((_element, context) => {
      captured = context
      if (mode === 'throw') throw new Error('expected fixture failure')
      return mode === 'null' ? null : { elements: [], destroy() { disposed++ } }
    })
    const warn = console.warn
    console.warn = () => {}
    try { slot.refresh() } finally { console.warn = warn }
    assert.equal(captured.mutate(() => 'stale'), undefined, mode)
    assert.equal(state.mutations, 0, mode)
    assert.equal(disposed, mode === 'empty' ? 1 : 0, mode)
  }
})

test('clearing a suppressed group releases selection tracking and makes pending frames inert', () => {
  const { slot, state, frames } = fixture()
  slot.refresh(); state.contexts[0].suppressSelectionChange()
  slot.clear()
  assert.deepEqual(state.suppression, [true, false])
  while (frames.length) frames.shift()()
  assert.deepEqual(state.suppression, [true, false])
})

test('block-control teardown is permanent even when user cleanup requests another refresh', () => {
  const { slot, state, zone } = fixture()
  slot.refresh()
  const first = state.groups[0]
  first.destroy = function () { this.destroyed++; slot.refresh() }
  slot.destroy()
  slot.refresh(); slot.destroy()
  assert.equal(first.destroyed, 1)
  assert.equal(state.groups.length, 1)
  assert.equal(zone.children.length, 0)
  assert.equal(state.contexts[0].mutate(() => 42), undefined)
})

test('a superseded control renderer disposes its unmounted group without retiring the newer one', () => {
  const { slot, renderWith, zone, element } = fixture()
  let calls = 0
  const contexts = []
  const groups = [0, 1].map(() => ({ elements: [element()], disposed: 0, destroy() { this.disposed++ } }))
  renderWith((_element, context) => {
    const index = calls++
    contexts.push(context)
    if (index === 0) slot.refresh()
    return groups[index]
  })
  slot.refresh()
  assert.equal(groups[0].disposed, 1)
  assert.equal(groups[1].disposed, 0)
  assert.deepEqual(zone.children, groups[1].elements)
  assert.equal(contexts[0].mutate(() => 1), undefined)
  assert.equal(contexts[1].mutate(() => 2), 2)
  slot.clear()
  assert.equal(groups[1].disposed, 1)
})

test('asynchronous control cleanup failures are contained without delaying removal', async () => {
  const { slot, state, zone } = fixture()
  slot.refresh()
  let observed = 0
  const error = new Error('expected cleanup rejection')
  state.groups[0].destroy = () => ({ then(_resolve, reject) { observed++; reject(error) } })
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    slot.clear()
    assert.equal(zone.children.length, 0)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(observed, 1)
    assert.equal(warnings.length, 1)
    assert.strictEqual(warnings[0][1], error)
  } finally { console.warn = warn }
})

test('source replacement cannot strand selection suppression when its group has not refreshed yet', () => {
  const { slot, state, frames, replaceBlock } = fixture()
  slot.refresh(); state.contexts[0].suppressSelectionChange(); replaceBlock()
  while (frames.length) frames.shift()()
  assert.deepEqual(state.suppression, [true, false])
  assert.equal(state.contexts[0].mutate(() => 'stale'), undefined)
})
