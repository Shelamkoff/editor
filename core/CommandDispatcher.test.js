// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { CommandDispatcher } from './CommandDispatcher.js'
import { EditorEvent } from './editorEvents.js'

function harness() {
  const emitted = []
  const events = { emit: (event, data) => emitted.push([event, data]) }
  const block = {
    id: 'a',
    type: 'paragraph',
    value: 'initial',
    dirty: 0,
    markDirty() { this.dirty++ },
  }
  const blocks = {
    getBlockById: id => id === block.id ? block : undefined,
  }
  return { emitted, block, commands: new CommandDispatcher(blocks, events) }
}

test('nested commands produce one ordered history commit', () => {
  const { emitted, block, commands } = harness()
  commands.execute({
    name: 'outer',
    affected: [block],
    apply() {
      commands.runForBlock(block, () => { block.value = 'changed' })
    },
  })

  assert.equal(block.dirty, 1)
  assert.deepEqual(emitted.map(([event]) => event), [
    EditorEvent.WILL_CHANGE,
    EditorEvent.BLOCK_CHANGED,
    EditorEvent.CHANGED,
    EditorEvent.HISTORY_COMMIT,
  ])
})

test('failed commands restore their checkpoint without advancing history', () => {
  const { emitted, block, commands } = harness()
  commands.configureRollback(
    () => ({ version: 'test', blocks: [], value: block.value }),
    checkpoint => { block.value = checkpoint.value },
  )

  assert.throws(() => commands.execute({
    name: 'failure',
    affected: [block],
    apply() {
      block.value = 'partial'
      throw new Error('failed')
    },
  }), /failed/)

  assert.equal(block.value, 'initial')
  assert.equal(block.dirty, 0)
  assert.deepEqual(emitted.map(([event]) => event), [EditorEvent.WILL_CHANGE])
})

test('caught nested failures still poison and roll back the outer command', () => {
  const { block, commands } = harness()
  commands.configureRollback(
    () => ({ version: 'test', blocks: [], value: block.value }),
    checkpoint => { block.value = checkpoint.value },
  )

  assert.throws(() => commands.execute({
    name: 'outer',
    apply() {
      block.value = 'partial'
      try {
        commands.execute({ name: 'nested', apply: () => { throw new Error('nested failed') } })
      } catch { /* the dispatcher still rejects the transaction */ }
    },
  }), /nested failed/)
  assert.equal(block.value, 'initial')
})

test('an explicit inverse avoids the checkpoint fallback', () => {
  const { block, commands } = harness()
  let restoredCheckpoint = false
  commands.configureRollback(
    () => ({ version: 'test', blocks: [] }),
    () => { restoredCheckpoint = true },
  )
  assert.throws(() => commands.execute({
    name: 'inverse',
    apply() { block.value = 'partial'; throw new Error('failed') },
    rollback() { block.value = 'initial' },
  }), /failed/)
  assert.equal(block.value, 'initial')
  assert.equal(restoredCheckpoint, false)
})
