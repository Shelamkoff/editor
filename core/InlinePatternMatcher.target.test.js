// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { InlinePatternMatcher } from './InlinePatternMatcher.js'

class FakeRoot {
  listeners = new Map()
  addEventListener(type, handler) { this.listeners.set(type, handler) }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type) }
}

test('pattern matcher ignores keydown from native controls when selection is stale', () => {
  const previousWindow = globalThis.window
  const previousNode = globalThis.Node
  globalThis.Node = { TEXT_NODE: 3 }

  const staleText = {
    nodeType: 3,
    data: '#ff0000',
    parentElement: { closest() { return null } },
  }
  globalThis.window = {
    getSelection() {
      return {
        isCollapsed: true,
        rangeCount: 1,
        anchorNode: staleText,
        anchorOffset: staleText.data.length,
      }
    },
  }

  const root = new FakeRoot()
  root.contains = () => true
  const registry = {
    *values() {
      yield { type: 'color', pasteConfig: { patterns: [/^#[0-9a-f]{6}$/i] } }
    },
  }
  const events = { on() { return () => {} } }
  const blocks = { getBlockByChildNode() { return undefined } }
  const commands = { runForBlock() { throw new Error('must not mutate stale selection') } }
  const matcher = new InlinePatternMatcher(root, registry, {}, events, blocks, commands)

  let prevented = false
  let stopped = false
  try {
    root.listeners.get('keydown')({
      key: ' ',
      target: { tagName: 'INPUT', closest() { return null } },
      preventDefault() { prevented = true },
      stopPropagation() { stopped = true },
    })
    assert.equal(prevented, false)
    assert.equal(stopped, false)
  } finally {
    matcher.destroy()
    globalThis.window = previousWindow
    globalThis.Node = previousNode
  }
})
