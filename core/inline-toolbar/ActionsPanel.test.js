// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionsPanel } from './ActionsPanel.js'

function fixture() {
  const calls = { mutations: [], restore: 0, showTooltip: 0, hideTooltip: 0, closed: 0 }
  const live = new Set()
  const field = () => {
    const node = { nodeType: 1, closest() { return this }, focus() {} }
    live.add(node)
    return node
  }
  const a = field(), b = field()
  let selected = a
  const range = node => ({ startContainer: node, endContainer: node,
    cloneRange() { return range(node) } })
  const selection = {
    rangeCount: 1, getRangeAt: () => range(selected),
    removeAllRanges() { calls.restore++ }, addRange() {},
  }
  const rootEl = { contains: node => live.has(node), ownerDocument: {
    defaultView: { getSelection: () => selection },
  } }
  const panel = new ActionsPanel({ rootEl, crossBlockSelection: {range: null},
    tooltip: {show() { calls.showTooltip++ }, hide() { calls.hideTooltip++ }},
    mutate(r, op) { calls.mutations.push(r); return op() },
    updateActiveStates() {}, hideTypeSelector() {}, onClosed() { calls.closed++ },
  })
  function open(result = 'panel') {
    let ctx
    const element = { removed: false, remove() { this.removed = true } }
    panel.open({ renderActions(context) {
      ctx = context
      if (result === 'throw') throw new Error('render failed')
      return result === 'null' ? null : element
    } })
    return { ctx, element }
  }
  return { panel, calls, a, b, live, open, select(node) { selected = node } }
}

for (const action of ['close', 'reset']) {
  test(`retired actions context cannot mutate after ${action}`, () => {
    const f = fixture()
    const old = f.open()
    f.panel[action]()
    let ran = 0
    old.ctx.mutate(() => ran++)
    assert.equal(ran, 0)
    assert.deepEqual(f.calls.mutations, [])
    assert.equal(old.element.removed, true)
  })
}

test('opening another actions panel retires the old panel and its capabilities', () => {
  const f = fixture()
  const old = f.open()
  f.select(f.b)
  const next = f.open()
  assert.equal(old.element.removed, true, 'superseded panel must release its DOM')
  old.ctx.mutate(() => assert.fail('old operation must not use the new range'))
  old.ctx.restoreSelection()
  old.ctx.showTooltip({}, 'stale')
  old.ctx.hideTooltip()
  old.ctx.close()
  assert.equal(next.element.removed, false, 'old close must not remove the new panel')
  assert.equal(f.calls.showTooltip, 0)
  assert.equal(f.calls.restore, 0)
  assert.equal(f.calls.closed, 0)
  assert.equal(next.ctx.mutate(() => 'value'), 'value')
  assert.strictEqual(f.calls.mutations[0].startContainer, f.b)
  next.ctx.close()
  assert.equal(next.element.removed, true)
})

test('a discarded renderActions context is inert when a tool requests toggle semantics', () => {
  const f = fixture()
  const {ctx} = f.open('null')
  ctx.mutate(() => assert.fail('no live actions result owns this context'))
  ctx.restoreSelection()
  assert.deepEqual(f.calls.mutations, [])
  assert.equal(f.calls.restore, 0)
})

test('reset after renderActions throws leaves any captured context inert', () => {
  const f = fixture()
  let ctx
  assert.throws(() => f.panel.open({ renderActions(value) { ctx = value; throw new Error('failed') } }), /failed/)
  ctx.mutate(() => assert.fail('failed render may not retain mutation access'))
  assert.deepEqual(f.calls.mutations, [])
})

test('actions from a detached source range do not modify a reconstructed document', () => {
  const f = fixture()
  const {ctx} = f.open()
  f.live.delete(f.a)
  ctx.mutate(() => assert.fail('detached selection must not start a command'))
  ctx.restoreSelection()
  assert.deepEqual(f.calls.mutations, [])
  assert.equal(f.calls.restore, 0)
  ctx.close()
})

test('the current actions context still mutates, restores and closes once', () => {
  const f = fixture()
  const {ctx, element} = f.open()
  assert.equal(ctx.mutate(() => 42), 42)
  assert.strictEqual(f.calls.mutations[0].startContainer, f.a)
  ctx.showTooltip({}, 'live')
  assert.equal(f.calls.showTooltip, 1)
  ctx.close(); ctx.close()
  assert.equal(element.removed, true)
  assert.equal(f.calls.closed, 1)
})

test('destroy retires actions and prevents reopening through the old owner', () => {
  const f = fixture()
  const {ctx, element} = f.open()
  f.panel.destroy()
  assert.equal(ctx.mutate(() => assert.fail('retired action')), undefined)
  assert.equal(element.removed, true)
  assert.equal(f.panel.open({ renderActions() { assert.fail('destroyed owner must not create UI') } }), null)
})
