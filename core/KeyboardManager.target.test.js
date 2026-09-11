// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { KeyboardManager } from './KeyboardManager.js'
import { BLOCK_SELECTOR } from './constants.js'

function harness(shortcutHandle = () => false) {
  const listeners = new Map()
  const documentListeners = new Map()
  const ownerDocument = {
    addEventListener(type, handler) { documentListeners.set(type, handler) },
    removeEventListener(type, handler) {
      if (documentListeners.get(type) === handler) documentListeners.delete(type)
    },
  }
  const root = {
    ownerDocument,
    addEventListener(type, handler) { listeners.set(type, handler) },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type)
    },
    contains() { return true },
  }
  const calls = []
  const blockOps = {
    splitBlock() { calls.push('split') },
    mergeWithPrevious() { return false },
    exitEmptyBlock() { return false },
    mergeWithNext() { return false },
    navigateToPrevious() { return false },
    navigateToNext() { return false },
  }
  const shortcuts = { handle: shortcutHandle }
  const blocks = { hasSelectedBlocks() { return false } }
  const events = { emit() {} }
  const manager = new KeyboardManager(root, blockOps, shortcuts, blocks, events, 'paragraph')
  return { listeners, calls, manager }
}

function keyTarget(kind, inBlock = true) {
  const block = { kind: 'block' }
  const control = {
    hasAttribute() { return false },
    closest(selector) {
      if (selector === 'input, textarea, select') return null
      if (selector.includes('button') && kind === 'button') return control
      if (selector.includes('a[href]') && kind === 'link') return control
      if (selector === BLOCK_SELECTOR) return inBlock ? block : null
      return null
    },
  }
  return control
}

test('native interactive controls inside blocks keep Enter instead of splitting the block', () => {
  const { listeners, calls, manager } = harness()
  for (const kind of ['button', 'link']) {
    let prevented = false
    const event = {
      target: keyTarget(kind),
      key: 'Enter',
      code: 'Enter',
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault() { prevented = true },
    }
    listeners.get('keydown')(event)
    assert.equal(prevented, false, `${kind} Enter default was prevented`)
  }
  assert.deepEqual(calls, [])
  manager.destroy()
})


test('editor-scoped history remains available from action controls', () => {
  const scopes = []
  const { listeners, calls, manager } = harness((_event, scope) => {
    scopes.push(scope)
    return scope === 'editor'
  })
  let prevented = false
  const event = {
    target: keyTarget('button', false),
    key: 'z',
    code: 'KeyZ',
    shiftKey: false,
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    preventDefault() { prevented = true },
  }
  listeners.get('keydown')(event)
  assert.deepEqual(scopes, ['editor'])
  assert.deepEqual(calls, [])
  assert.equal(prevented, false)
  manager.destroy()
})
