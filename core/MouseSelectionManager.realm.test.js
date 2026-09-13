// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { MouseSelectionManager } from './MouseSelectionManager.js'

test('mouse selection listeners belong to the editor document', () => {
  const added = []
  const removed = []
  const ownerDocument = {
    defaultView: { HTMLElement: class {} },
    addEventListener(type, handler, capture) { added.push([type, handler, capture]) },
    removeEventListener(type, handler, capture) { removed.push([type, handler, capture]) },
  }
  const root = {
    ownerDocument,
    addEventListener() {},
    removeEventListener() {},
  }
  const config = {
    blocksEl: {},
    clickArea: {},
    blocks: {},
    selection: {},
    events: {},
    crossBlockSelection: {},
    defaultBlockType: 'paragraph',
  }

  const previousDocument = globalThis.document
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    const manager = new MouseSelectionManager(root, config)
    manager.destroy()
  } finally {
    globalThis.document = previousDocument
  }

  assert.deepEqual(added.map(([type, , capture]) => [type, capture]), [
    ['mousemove', undefined], ['mouseup', undefined], ['mousedown', true],
  ])
  assert.deepEqual(removed.map(([type, , capture]) => [type, capture]), [
    ['mousemove', undefined], ['mouseup', undefined], ['mousedown', true],
  ])
  assert.equal(added[0][1], removed[0][1])
  assert.equal(added[1][1], removed[1][1])
  assert.equal(added[2][1], removed[2][1])
})
