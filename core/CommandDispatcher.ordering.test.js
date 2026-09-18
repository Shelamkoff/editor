// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { EventBus } from '@shelamkoff/event-bus'
import { CommandDispatcher } from './CommandDispatcher.js'
import { EditorEventSubscriptions } from './PublicEditorApi.js'
import { EditorEvent } from './editorEvents.js'
import { Diagnostics } from './Diagnostics.js'

function createHarness() {
  const events = new EventBus()
  const blocks = { getBlockById() { return undefined }, *[Symbol.iterator]() {} }
  const commands = new CommandDispatcher(blocks, events)
  commands.configureCommit(() => {})
  const publicEvents = new EditorEventSubscriptions(events, commands)
  return { events, commands, publicEvents }
}

test('reentrant command observations stay behind every public event of their parent command', () => {
  const { events, commands, publicEvents } = createHarness()
  const order = []

  publicEvents.on(EditorEvent.BLOCK_ADDED, ({ blockId }) => {
    order.push(`${blockId}:added`)
    if (blockId === 'a') {
      commands.execute({
        name: 'child',
        markDirty: false,
        apply() { events.emit(EditorEvent.BLOCK_ADDED, { blockId: 'b', index: 1 }) },
      })
    }
  })
  publicEvents.on(EditorEvent.CHANGED, () => order.push('changed'))
  publicEvents.on(EditorEvent.HISTORY_COMMIT, () => order.push('history'))

  commands.execute({
    name: 'parent',
    markDirty: false,
    apply() { events.emit(EditorEvent.BLOCK_ADDED, { blockId: 'a', index: 0 }) },
  })

  assert.deepEqual(order, [
    'a:added',
    'changed',
    'history',
    'b:added',
    'changed',
    'history',
  ])
})

test('failed reentrant commands discard only their own queued observations', () => {
  const { events, commands, publicEvents } = createHarness()
  const order = []

  publicEvents.on(EditorEvent.BLOCK_ADDED, ({ blockId }) => {
    order.push(`${blockId}:added`)
    if (blockId !== 'a') return
    assert.throws(() => commands.execute({
      name: 'failed-child',
      markDirty: false,
      apply() {
        events.emit(EditorEvent.BLOCK_ADDED, { blockId: 'failed', index: 1 })
        throw new Error('expected')
      },
    }), /expected/)
  })
  publicEvents.on(EditorEvent.CHANGED, () => order.push('changed'))
  publicEvents.on(EditorEvent.HISTORY_COMMIT, () => order.push('history'))

  commands.execute({
    name: 'parent',
    markDirty: false,
    apply() { events.emit(EditorEvent.BLOCK_ADDED, { blockId: 'a', index: 0 }) },
  })

  assert.deepEqual(order, ['a:added', 'changed', 'history'])
})

test('notifyChange false commands still flush committed structural observations', () => {
  const { events, commands, publicEvents } = createHarness()
  const order = []
  publicEvents.on(EditorEvent.BLOCK_ADDED, ({ blockId }) => order.push(blockId))

  commands.execute({
    name: 'silent-document-command',
    notifyChange: false,
    markDirty: false,
    apply() { events.emit(EditorEvent.BLOCK_ADDED, { blockId: 'silent', index: 0 }) },
  })

  assert.deepEqual(order, ['silent'])
})


test('slow diagnostic observers cannot overtake terminal events', async () => {
  const events = new EventBus()
  const blocks = { getBlockById() { return undefined }, *[Symbol.iterator]() {} }
  const order = []
  let commands
  let spawnedChild = false
  const diagnostics = new Diagnostics(() => {
    order.push('diagnostic')
    if (spawnedChild) return
    spawnedChild = true
    commands.execute({
      name: 'diagnostic-child',
      markDirty: false,
      apply() { events.emit(EditorEvent.BLOCK_ADDED, { blockId: 'b', index: 1 }) },
    })
  }, { commandMs: 0 })
  commands = new CommandDispatcher(blocks, events, diagnostics)
  commands.configureCommit(() => {})
  const publicEvents = new EditorEventSubscriptions(events, commands)

  publicEvents.on(EditorEvent.BLOCK_ADDED, ({ blockId }) => order.push(`${blockId}:added`))
  publicEvents.on(EditorEvent.CHANGED, () => order.push('changed'))
  publicEvents.on(EditorEvent.HISTORY_COMMIT, () => order.push('history'))

  commands.execute({
    name: 'parent',
    markDirty: false,
    apply() { events.emit(EditorEvent.BLOCK_ADDED, { blockId: 'a', index: 0 }) },
  })

  assert.deepEqual(order, ['a:added', 'changed', 'history'])
  await Promise.resolve()
  assert.deepEqual(order, [
    'a:added',
    'changed',
    'history',
    'diagnostic',
    'b:added',
    'changed',
    'history',
  ])
  await Promise.resolve()
  assert.deepEqual(order, [
    'a:added',
    'changed',
    'history',
    'diagnostic',
    'b:added',
    'changed',
    'history',
    'diagnostic',
  ])
})


test('external commit observers are delivered only after the commit phase', () => {
  const events = new EventBus()
  const block = { id: 'a', markDirty() {} }
  const blocks = { getBlockById(id) { return id === block.id ? block : undefined } }
  const commands = new CommandDispatcher(blocks, events)
  const publicEvents = new EditorEventSubscriptions(events, commands)
  const order = []
  let observedInTransaction = null

  commands.configureCommit(() => {
    events.emit(EditorEvent.HISTORY_CHANGED, { canUndo: true, canRedo: false })
  })
  publicEvents.on(EditorEvent.HISTORY_CHANGED, () => {
    observedInTransaction = commands.inTransaction
    order.push('history:changed')
  })
  publicEvents.on(EditorEvent.BLOCK_CHANGED, () => order.push('block:changed'))
  publicEvents.on(EditorEvent.CHANGED, () => order.push('editor:changed'))
  publicEvents.on(EditorEvent.HISTORY_COMMIT, () => order.push('history:commit'))

  commands.commitExternal(block)

  assert.equal(observedInTransaction, false)
  assert.deepEqual(order, [
    'history:changed',
    'block:changed',
    'editor:changed',
    'history:commit',
  ])
})
