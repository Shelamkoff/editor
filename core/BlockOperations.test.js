// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { BlockOperations } from './BlockOperations.js'
import { CommandDispatcher } from './CommandDispatcher.js'
import { EditorEvent } from './editorEvents.js'

test('split marks and publishes the source block exactly once', () => {
  const emitted = []
  const events = { emit(event, data) { emitted.push([event, data]) } }
  const current = {
    id: 'source',
    type: 'paragraph',
    dirty: 0,
    save() { return { data: { text: 'left' } } },
    markDirty() { this.dirty++ },
  }
  const inserted = { id: 'inserted', focus() {} }
  let currentIndex = 0
  const blocks = {
    getCurrentBlock() { return current },
    getCurrentIndex() { return currentIndex },
    getBlockById(id) { return id === current.id ? current : undefined },
    insert() { return inserted },
    setCurrentIndex(index) { currentIndex = index },
  }
  const selection = {
    extractFragmentAfterCaret() { return 'right' },
    setCaretToBlock() {},
  }
  const commands = new CommandDispatcher(blocks, events)
  const operations = new BlockOperations(blocks, selection, 'paragraph', events, commands)

  operations.splitBlock()

  assert.equal(current.dirty, 1)
  assert.equal(
    emitted.filter(([event, data]) => event === EditorEvent.BLOCK_CHANGED && data?.blockId === current.id).length,
    1,
  )
})
