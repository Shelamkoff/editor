// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { capturePasteSelection } from './pasteSelection.js'

test('paste rollback captures selection from the editor owning window', () => {
  let selectionReads = 0
  const ownerSelection = { rangeCount: 0 }
  const root = {
    ownerDocument: {
      defaultView: {
        getSelection() {
          selectionReads++
          return ownerSelection
        },
      },
    },
  }
  const blocks = {
    getSelectedBlocks() { return [] },
    getCurrentBlock() { return undefined },
    getBlockByChildNode() { return undefined },
    *[Symbol.iterator]() {},
  }
  const selection = { setCaretToOffset() {} }
  const crossSelection = { range: null, activate() {} }

  const previousWindow = globalThis.window
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  try {
    const restore = capturePasteSelection(root, blocks, selection, crossSelection)
    restore()
  } finally {
    globalThis.window = previousWindow
  }

  assert.equal(selectionReads, 1)
})
