// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { EventBus } from '@shelamkoff/event-bus'
import { EditorBlocksApi } from './PublicEditorApi.js'

function block(id, type, marker) {
  return {
    id,
    type,
    marker,
    element: { marker },
    contentElement: { marker },
    focused: false,
    selected: false,
    hasInlineTools: true,
    canMerge: true,
    version: 0,
    focus() {},
    isEmpty() { return false },
  }
}

test('retained public block view follows an atomic conversion with the same id', () => {
  let live = block('a', 'paragraph', 'old')
  const manager = {
    getBlockById(id) { return id === live?.id ? live : undefined },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() { if (live) yield live },
  }
  const api = new EditorBlocksApi(manager, new EventBus())
  const view = api.getBlockById('a')

  assert.equal(view.type, 'paragraph')
  assert.equal(view.element.marker, 'old')

  live = block('a', 'heading', 'new')
  assert.equal(view.type, 'heading')
  assert.equal(view.element.marker, 'new')
  assert.strictEqual(api.getBlockById('a'), view, 'one document id should keep one public identity handle')
})

test('retained public block view never exposes a detached removed block', () => {
  let live = block('a', 'paragraph', 'old')
  const manager = {
    getBlockById(id) { return id === live?.id ? live : undefined },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() { if (live) yield live },
  }
  const api = new EditorBlocksApi(manager, new EventBus())
  const view = api.getBlockById('a')

  live = undefined
  assert.throws(() => view.type, /no longer attached/)
  assert.throws(() => view.element, /no longer attached/)
  assert.throws(() => view.focus(), /no longer attached/)
})


test('committed removal evicts the cache while retained ID handles can follow a later reuse', () => {
  let live = block('a', 'paragraph', 'old')
  const events = new EventBus()
  const manager = {
    getBlockById(id) { return id === live?.id ? live : undefined },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() { if (live) yield live },
  }
  const api = new EditorBlocksApi(manager, events)
  const oldView = api.getBlockById('a')

  live = undefined
  events.emit('block:removed', { blockId: 'a', index: 0 })
  assert.throws(() => oldView.type, /no longer attached/)

  live = block('a', 'heading', 'reused')
  const newView = api.getBlockById('a')
  assert.notStrictEqual(newView, oldView, 'committed removal must release the cache entry')
  assert.equal(newView.type, 'heading')
  assert.equal(oldView.type, 'heading', 'retained handles resolve document identity by id')
  assert.equal(oldView.element.marker, 'reused')
})

test('rolled-back removal does not retire a cached view', () => {
  let live = block('a', 'paragraph', 'old')
  const events = new EventBus()
  const queued = []
  const commands = { afterCommit(callback) { queued.push(callback) } }
  const manager = {
    getBlockById(id) { return id === live?.id ? live : undefined },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() { if (live) yield live },
  }
  const api = new EditorBlocksApi(manager, events, commands)
  const view = api.getBlockById('a')

  live = undefined
  events.emit('block:removed', { blockId: 'a', index: 0 })
  live = block('a', 'paragraph', 'restored')
  // Simulate rollback by dropping the queued after-commit callback.
  queued.length = 0

  assert.equal(view.element.marker, 'restored')
  assert.strictEqual(api.getBlockById('a'), view)
})

test('document replacement retires only views for ids absent after commit', () => {
  let items = [
    block('keep', 'paragraph', 'old-keep'),
    block('drop', 'paragraph', 'old-drop'),
  ]
  const events = new EventBus()
  const manager = {
    getBlockById(id) { return items.find(item => item.id === id) },
    getSelectedBlocks() { return [] },
    *[Symbol.iterator]() { yield* items },
  }
  const api = new EditorBlocksApi(manager, events)
  const keep = api.getBlockById('keep')
  const drop = api.getBlockById('drop')

  items = [block('keep', 'heading', 'new-keep')]
  events.emit('document:replaced')

  assert.equal(keep.type, 'heading')
  assert.throws(() => drop.type, /no longer attached/)
  assert.strictEqual(api.getBlockById('keep'), keep)
})
