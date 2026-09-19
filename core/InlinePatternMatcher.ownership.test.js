import assert from 'node:assert/strict'
import test from 'node:test'
import { InlinePatternMatcher } from './InlinePatternMatcher.js'
import { EditorEvent } from './editorEvents.js'

function fixture({ mapped = true, editable = 'true', form = false, widget = false } = {}) {
  const callbacks = new Map()
  const field = { contentEditable: editable }
  const parentElement = {
    closest(selector) {
      if (selector === '[contenteditable]') return field
      if (selector === '[data-inline-plugin]') return widget ? {} : null
      if (selector.includes('input') || selector.includes('button')) return form || widget ? {} : null
      return null
    },
  }
  const node = { nodeType: 3, textContent: '#ff0000', data: '#ff0000', parentElement }
  const contentElement = { contains: value => value === field || value === node }
  const block = { id: 'a', contentElement, plugin: mapped ? { mapTextFields() {} } : {} }
  const view = { NodeFilter: { SHOW_TEXT: 4 }, getSelection() { return null } }
  const document = {
    defaultView: view,
    createTreeWalker() {
      let read = false
      return { currentNode: node, nextNode() { if (read) return false; read = true; return true } }
    },
  }
  const root = { ownerDocument: document, addEventListener() {}, removeEventListener() {} }
  const events = { on(event, fn) { callbacks.set(event, fn); return () => callbacks.delete(event) } }
  const blocks = { getBlockIndex: () => 0, getBlockByIndex: () => block, getCurrentIndex: () => 0 }
  const runs = []
  const inline = { pasteConfig: { patterns: [/^#[0-9a-f]{6}$/i] } }
  const registry = { *values() { yield inline } }
  const commands = { runForBlocks(affected) { runs.push([...affected]) } }
  const matcher = new InlinePatternMatcher(root, registry, {}, events, blocks, commands)
  return { matcher, runs, block, scan: () => callbacks.get(EditorEvent.PASTE_APPLIED)({ startBlockId: 'a', endBlockId: 'a' }) }
}

for (const [label, options] of [
  ['a plugin without an inline serialization contract', { mapped: false }],
  ['a noneditable field', { editable: 'false' }],
  ['an auxiliary form or button', { form: true }],
  ['an existing inline widget', { widget: true }],
]) {
  test(`paste pattern scan ignores ${label}`, () => {
    const f = fixture(options)
    try { f.scan(); assert.deepEqual(f.runs, []) } finally { f.matcher.destroy() }
  })
}

test('paste pattern scan includes an authored rich-text field', () => {
  const f = fixture()
  try { f.scan(); assert.deepEqual(f.runs, [[f.block]]) } finally { f.matcher.destroy() }
})
