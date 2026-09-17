// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { EventBus } from '@shelamkoff/event-bus'
import { CommandDispatcher } from './CommandDispatcher.js'
import { EditorEventSubscriptions } from './PublicEditorApi.js'
import { EditorEvent } from './editorEvents.js'

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
