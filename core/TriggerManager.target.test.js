// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { TriggerManager } from './TriggerManager.js'

class FakeTarget {
  listeners = new Map()
  addEventListener(type, handler) { this.listeners.set(type, handler) }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type) }
  fire(type, event) { this.listeners.get(type)?.(event) }
}

class FakeRoot extends FakeTarget {
  contains() { return true }
}

test('inline triggers ignore bubbled input from auxiliary controls with a stale editor selection', () => {
  let staleText
  const editingHost = {
    closest(selector) { return selector === '[contenteditable="true"]' ? this : null },
    contains(node) { return node === staleText },
  }
  staleText = { nodeType: 3, data: '@', parentElement: editingHost }

  const view = new FakeTarget()
  view.getSelection = () => ({
    isCollapsed: true,
    rangeCount: 1,
    anchorNode: staleText,
    anchorOffset: 1,
  })

  let edits = 0
  let cancels = 0
  const plugin = {
    type: 'mention',
    trigger: '@',
    onEdit() { edits++ },
    onCancel() { cancels++ },
  }
  const registry = {
    triggerKeys() { return ['@'] },
    getByTrigger(char) { return char === '@' ? plugin : undefined },
  }
  const root = new FakeRoot()
  root.ownerDocument = { defaultView: view }
  const manager = new TriggerManager(root, registry, { hidePopup() {} }, { on() { return () => {} } })

  root.listeners.get('input')({ target: { tagName: 'INPUT', closest() { return null } } })
  assert.equal(edits, 0)
  assert.equal(manager.isActive, false)

  root.listeners.get('input')({ target: editingHost })
  assert.equal(edits, 1)
  assert.equal(manager.isActive, true)

  let prevented = false
  let stopped = false
  view.fire('keydown', {
    key: 'Escape',
    target: { tagName: 'INPUT', closest() { return null } },
    preventDefault() { prevented = true },
    stopPropagation() { stopped = true },
  })
  assert.equal(prevented, false)
  assert.equal(stopped, false)
  assert.equal(cancels, 0)
  assert.equal(manager.isActive, true)

  manager.destroy()
  assert.equal(view.listeners.has('keydown'), false)
})
