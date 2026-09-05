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


for (const cause of [0, false, '', null, undefined]) {
  test(`caught nested failure ${String(cause)} rolls back the whole command`, () => {
    const { emitted, block, commands } = harness()
    commands.configureRollback(
      () => ({ version: 'test', blocks: [], value: block.value }),
      checkpoint => { block.value = checkpoint.value },
    )
    let threw = false
    try {
      commands.execute({
        name: 'outer',
        affected: [block],
        apply() {
          block.value = 'partial'
          try {
            commands.execute({ name: 'nested', apply() { throw cause } })
          } catch { /* A caught failure must still abort the outer command. */ }
          try {
            commands.execute({ name: 'later', apply() { throw new Error('later failure') } })
          } catch { /* The first cause, including null/undefined, must win. */ }
        },
      })
    } catch (error) {
      threw = true
      assert.strictEqual(error, cause)
    }
    assert.equal(threw, true, 'outer command must rethrow the first failure')
    assert.equal(block.value, 'initial')
    assert.equal(block.dirty, 0)
    assert.deepEqual(emitted.map(([event]) => event), [EditorEvent.WILL_CHANGE])

    commands.runForBlock(block, () => { block.value = 'next command' })
    assert.equal(block.value, 'next command', 'failure state must not poison later commands')
    assert.equal(block.dirty, 1)
  })
}
