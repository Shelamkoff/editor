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
