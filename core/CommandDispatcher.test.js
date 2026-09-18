// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { CommandDispatcher } from './CommandDispatcher.js'
import { EditorEvent } from './editorEvents.js'
import { EventBus } from '@shelamkoff/event-bus'

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

test('a nested failure forces the outer checkpoint instead of a partial inverse', () => {
  const { commands } = harness()
  const state = { outer: 'initial', nested: 'initial' }
  let restoredCheckpoint = false

  commands.configureRollback(
    () => ({ version: 'test', blocks: [], state: { ...state } }),
    checkpoint => {
      restoredCheckpoint = true
      Object.assign(state, checkpoint.state)
    },
  )

  assert.throws(() => commands.execute({
    name: 'outer-with-inverse',
    apply() {
      state.outer = 'outer-partial'
      try {
        commands.execute({
          name: 'nested-failure',
          apply() {
            state.nested = 'nested-partial'
            throw new Error('nested failed')
          },
        })
      } catch { /* transaction remains poisoned */ }
    },
    // This inverse only knows how to undo the outer command's own mutation.
    rollback() { state.outer = 'initial' },
  }), /nested failed/)

  assert.equal(restoredCheckpoint, true)
  assert.deepEqual(state, { outer: 'initial', nested: 'initial' })
})



test('reentrant command from WILL_CHANGE is rejected without poisoning a caught observer misuse', () => {
  const events = new EventBus()
  const state = { outer: 'initial', reentrant: 'initial' }
  const blocks = { getBlockById() { return undefined } }
  const commands = new CommandDispatcher(blocks, events)
  let commits = 0
  let historyCommits = 0
  let willChanges = 0

  commands.configureRollback(
    () => ({ version: 'test', blocks: [], state: { ...state } }),
    checkpoint => Object.assign(state, checkpoint.state),
  )
  commands.configureCommit(() => { commits += 1 })
  events.on(EditorEvent.HISTORY_COMMIT, () => { historyCommits += 1 })
  events.on(EditorEvent.WILL_CHANGE, () => {
    willChanges += 1
    try {
      commands.execute({
        name: 'will-change-reentrant',
        apply() { state.reentrant = 'changed' },
      })
    } catch {
      // Observers may contain the guard error; no nested mutation started.
    }
  })

  assert.doesNotThrow(() => commands.execute({
    name: 'outer',
    apply() { state.outer = 'changed' },
  }))

  assert.deepEqual(state, { outer: 'changed', reentrant: 'initial' })
  assert.equal(willChanges, 1)
  assert.equal(commits, 1)
  assert.equal(historyCommits, 1)
})


test('a caught command rejection during commit does not poison the outer transaction', () => {
  const events = new EventBus()
  const state = { outer: 'initial', commitNested: 'initial' }
  const blocks = { getBlockById() { return undefined } }
  const commands = new CommandDispatcher(blocks, events)

  commands.configureRollback(
    () => ({ version: 'test', blocks: [], state: { ...state } }),
    checkpoint => Object.assign(state, checkpoint.state),
  )
  commands.configureCommit(() => {
    try {
      commands.execute({
        name: 'commit-reentrant',
        apply() { state.commitNested = 'changed' },
      })
    } catch {
      // The nested command never started, so an observational callback may
      // safely contain this misuse without cancelling the parent command.
    }
  })

  assert.doesNotThrow(() => commands.execute({
    name: 'outer',
    apply() { state.outer = 'changed' },
  }))

  assert.deepEqual(state, { outer: 'changed', commitNested: 'initial' })
})


test('external commits cannot bypass WILL_CHANGE prelude guard', () => {
  const events = new EventBus()
  const block = { id: 'a', markDirty() {} }
  const blocks = { getBlockById(id) { return id === 'a' ? block : undefined } }
  const commands = new CommandDispatcher(blocks, events)
  commands.configureCommit(() => {})

  let rejected = false
  events.on(EditorEvent.WILL_CHANGE, () => {
    try {
      commands.commitExternal(block)
    } catch (error) {
      rejected = /WILL_CHANGE/.test(String(error))
    }
  })

  commands.execute({ name: 'outer', markDirty: false, apply() {} })
  assert.equal(rejected, true)
})
