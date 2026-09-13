// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { CompositionGuard } from './CompositionGuard.js'

class FakeTarget {
  constructor() { this.listeners = new Map() }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }
  removeEventListener(type, listener) {
    const list = this.listeners.get(type) ?? []
    this.listeners.set(type, list.filter(candidate => candidate !== listener))
  }
  fire(type, event) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
  }
}

test('IME guard captures on the owning window before document plugin listeners', () => {
  const view = new FakeTarget()
  const documentTarget = new FakeTarget()
  documentTarget.defaultView = view
  const root = new FakeTarget()
  const inside = {}
  root.ownerDocument = documentTarget
  root.contains = node => node === inside

  const guard = new CompositionGuard(root)
  assert.equal((view.listeners.get('keydown') ?? []).length, 1)
  assert.equal((documentTarget.listeners.get('keydown') ?? []).length, 0)

  root.fire('compositionstart', {})
  let stopped = false
  view.fire('keydown', {
    target: inside,
    isComposing: false,
    keyCode: 13,
    stopImmediatePropagation() { stopped = true },
  })
  assert.equal(stopped, true)

  guard.destroy()
  assert.equal((view.listeners.get('keydown') ?? []).length, 0)
})

test('IME guard does not borrow a global window for an owner document without a browsing context', () => {
  const documentTarget = new FakeTarget()
  documentTarget.defaultView = null
  const root = new FakeTarget()
  root.ownerDocument = documentTarget
  root.contains = () => true

  const guard = new CompositionGuard(root)
  assert.equal((root.listeners.get('compositionstart') ?? []).length, 1)
  assert.equal((documentTarget.listeners.get('keydown') ?? []).length, 0)

  guard.destroy()
  assert.equal((root.listeners.get('compositionstart') ?? []).length, 0)
})
