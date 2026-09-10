// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { TriggerManager } from './TriggerManager.js'

class FakeRoot {
  listeners = new Map()
  addEventListener(type, handler) { this.listeners.set(type, handler) }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type) }
  contains() { return true }
}

test('inline triggers ignore bubbled input from auxiliary controls with a stale editor selection', () => {
  const previousWindow = globalThis.window
  const previousNode = globalThis.Node
  globalThis.Node = { TEXT_NODE: 3 }

  let staleText
  const editingHost = {
    closest(selector) { return selector === '[contenteditable="true"]' ? this : null },
    contains(node) { return node === staleText },
  }
  staleText = { nodeType: 3, data: '@', parentElement: editingHost }
  globalThis.window = {
    getSelection() {
      return {
        isCollapsed: true,
        rangeCount: 1,
        anchorNode: staleText,
        anchorOffset: 1,
      }
    },
  }

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
  const manager = new TriggerManager(root, registry, { hidePopup() {} }, { on() { return () => {} } })

  try {
    root.listeners.get('input')({ target: { tagName: 'INPUT', closest() { return null } } })
    assert.equal(edits, 0)
    assert.equal(manager.isActive, false)

    root.listeners.get('input')({ target: editingHost })
    assert.equal(edits, 1)
    assert.equal(manager.isActive, true)

    let prevented = false
    let stopped = false
    root.listeners.get('keydown')({
      key: 'Escape',
      target: { tagName: 'INPUT', closest() { return null } },
      preventDefault() { prevented = true },
      stopPropagation() { stopped = true },
    })
    assert.equal(prevented, false)
    assert.equal(stopped, false)
    assert.equal(cancels, 0)
    assert.equal(manager.isActive, true)
  } finally {
    manager.destroy()
    globalThis.window = previousWindow
    globalThis.Node = previousNode
  }
})
