// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { CrossBlockEditor } from './CrossBlockEditor.js'

test('cross-block caret restoration uses the editor owning document', () => {
  const calls = []
  const nativeRange = {
    setStart(node, offset) { calls.push(['start', node, offset]) },
    collapse(value) { calls.push(['collapse', value]) },
  }
  const nativeSelection = {
    removeAllRanges() { calls.push(['remove']) },
    addRange(range) { calls.push(['add', range]) },
  }
  const ownerDocument = {
    defaultView: { getSelection() { return nativeSelection } },
    createRange() { calls.push(['create']); return nativeRange },
  }
  const root = { ownerDocument }
  const node = {}
  const block = { id: 'b', focus() { calls.push(['focus']) } }
  const blocks = {
    getBlockByChildNode(candidate) { return candidate === node ? block : undefined },
    getBlockIndex() { return 0 },
    setCurrentIndex(index) { calls.push(['index', index]) },
  }
  const editor = new CrossBlockEditor(root, blocks, {}, {}, {}, 'paragraph', {})

  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    editor.setCaretToRangeEnd({ endContainer: node, endOffset: 3 })
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }

  assert.deepEqual(calls, [
    ['index', 0], ['focus'], ['create'], ['start', node, 3], ['collapse', true], ['remove'], ['add', nativeRange],
  ])
})
