// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { InlinePatternMatcher } from './InlinePatternMatcher.js'

class FakeRoot {
  listeners = new Map()
  constructor(ownerDocument) { this.ownerDocument = ownerDocument }
  addEventListener(type, handler) { this.listeners.set(type, handler) }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type) }
}

test('pattern matcher ignores keydown from native controls when selection is stale', () => {
  const staleText = {
    nodeType: 3,
    data: '#ff0000',
    parentElement: { closest() { return null } },
  }
  const ownerDocument = {
    defaultView: {
      getSelection() {
        return {
          isCollapsed: true,
          rangeCount: 1,
          anchorNode: staleText,
          anchorOffset: staleText.data.length,
        }
      },
    },
  }

  const root = new FakeRoot(ownerDocument)
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
  }
})

test('pattern matcher reads the native selection from the editor owning window', () => {
  const text = {
    nodeType: 3,
    data: 'plain',
    parentElement: { closest() { return null } },
  }
  const editingHost = { contains(node) { return node === text } }
  const ownerDocument = {
    defaultView: {
      getSelection() {
        return {
          isCollapsed: true,
          rangeCount: 1,
          anchorNode: text,
          anchorOffset: text.data.length,
        }
      },
    },
  }
  const root = new FakeRoot(ownerDocument)
  root.contains = node => node === editingHost
  const registry = {
    *values() {
      yield { type: 'color', pasteConfig: { patterns: [/^#[0-9a-f]{6}$/i] } }
    },
  }
  const events = { on() { return () => {} } }
  const blocks = { getBlockByChildNode() { return undefined } }
  const commands = { runForBlock() { throw new Error('plain text must not mutate') } }
  const matcher = new InlinePatternMatcher(root, registry, {}, events, blocks, commands)

  const previousWindow = globalThis.window
  globalThis.window = {
    getSelection() { throw new Error('ambient selection must not be read') },
  }
  try {
    let prevented = false
    root.listeners.get('keydown')({
      key: ' ',
      target: { closest(selector) { return selector === '[contenteditable="true"]' ? editingHost : null } },
      preventDefault() { prevented = true },
      stopPropagation() {},
    })
    assert.equal(prevented, false)
  } finally {
    matcher.destroy()
    globalThis.window = previousWindow
  }
})
