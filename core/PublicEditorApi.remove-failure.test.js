// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorBlocksApi } from './PublicEditorApi.js'

const events = { on() { return () => {} }, emit() {} }

test('failed public removal leaves the current block focused', () => {
  const current = { id: 'current', focused: true, selected: false }
  const blocks = {
    getBlockByIndex(index) { return index === 0 ? current : undefined },
    getCurrentBlock() { return current },
    remove() { throw new Error('commit failed') },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() { yield current },
  }
  const api = new EditorBlocksApi(blocks, events)

  assert.throws(() => api.remove(0), /commit failed/)
  assert.equal(current.focused, true)
})
