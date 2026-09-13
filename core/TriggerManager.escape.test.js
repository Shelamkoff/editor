// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { TriggerManager } from './TriggerManager.js'

class FakeTarget {
  constructor() { this.listeners = new Map() }
  addEventListener(type, listener) { this.listeners.set(type, listener) }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type)
  }
  fire(type, event) { this.listeners.get(type)?.(event) }
}

test('Escape releases trigger state on the owning window before document capture listeners can swallow it', () => {
  const fakeWindow = new FakeTarget()
  const root = new FakeTarget()
  root.ownerDocument = { defaultView: fakeWindow }
  root.closest = selector => selector === '[contenteditable="true"]' ? root : null
  root.contains = node => node === root || node === textNode

  const textNode = {
    nodeType: 3,
    data: '@',
    parentElement: root,
    isConnected: true,
  }
  const plugin = {
    trigger: '@',
    edits: 0,
    cancels: 0,
    onEdit() { this.edits++ },
    onCancel() { this.cancels++ },
  }
  let hidden = 0
  const ctx = { hidePopup() { hidden++ } }
  const events = { on() { return () => {} } }
  const registry = {
    triggerKeys: () => ['@'],
    getByTrigger: char => char === '@' ? plugin : undefined,
  }

  fakeWindow.getSelection = () => ({
    isCollapsed: true,
    rangeCount: 1,
    anchorNode: textNode,
    anchorOffset: 1,
  })

  const manager = new TriggerManager(root, registry, ctx, events)
  root.fire('input', { target: root })
  assert.equal(manager.isActive, true)
  assert.equal(plugin.edits, 1)

  let prevented = false
  let stopped = false
  fakeWindow.fire('keydown', {
    target: root,
    key: 'Escape',
    preventDefault() { prevented = true },
    stopPropagation() { stopped = true },
  })

  assert.equal(manager.isActive, false)
  assert.equal(plugin.cancels, 1)
  assert.equal(hidden, 1)
  assert.equal(prevented, true)
  assert.equal(stopped, true)
  manager.destroy()
  assert.equal(fakeWindow.listeners.has('keydown'), false)
})
