import test from 'node:test'
import assert from 'node:assert/strict'

import { NativeInputController } from './NativeInputController.js'

function harness(options = {}) {
  const calls = []
  let now = 0
  const field = { parentNode: null }
  const child = { parentNode: field }
  const reconciler = {
    resolveEditableTarget(target) {
      for (let node = target; node; node = node.parentNode) {
        if (node === field) return {
          blockId: 'b1',
          fieldKey: 'text',
          element: field,
          mode: 'rich-text',
        }
      }
      return null
    },
  }
  const runtime = {
    readOnly: false,
    syncBlockFromProjection(id, operation, metadata) {
      operation()
      calls.push({ id, metadata })
    },
  }
  const root = {
    ownerDocument: { defaultView: { AbortController, performance: { now: () => now } } },
    addEventListener() {},
  }
  const controller = new NativeInputController({
    root,
    runtime,
    reconciler,
    coalesceMs: options.coalesceMs ?? 300,
  })
  return {
    calls,
    field,
    child,
    runtime,
    controller,
    advance(ms) { now += ms },
  }
}

test('plain text input keeps the browser-owned source projection in place', () => {
  const { calls, child, controller } = harness()
  controller.handleBeforeInput({
    target: child,
    inputType: 'insertText',
    isComposing: false,
  })
  controller.handleInput({
    target: child,
    inputType: 'insertText',
    isComposing: false,
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    id: 'b1',
    metadata: {
      origin: 'native-input',
      name: 'native-input',
      historyGroup: 'native:b1:text:1',
      coalesce: true,
      preserveSourceProjection: true,
    },
  })
})

test('typing coalesces only inside the configured history window', () => {
  const { calls, child, controller, advance } = harness({ coalesceMs: 300 })

  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })
  advance(299)
  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })
  advance(301)
  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })

  assert.equal(calls[0].metadata.historyGroup, 'native:b1:text:1')
  assert.equal(calls[1].metadata.historyGroup, 'native:b1:text:1')
  assert.equal(calls[2].metadata.historyGroup, 'native:b1:text:2')
})

test('paste and drop never trust the mutated source projection', () => {
  for (const inputType of ['insertFromPaste', 'insertFromDrop']) {
    const { calls, child, controller } = harness()
    controller.handleInput({ target: child, inputType, isComposing: false })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].metadata.preserveSourceProjection, false)
  }
})

test('input without beforeinput still synchronizes the owning field', () => {
  const { calls, child, controller } = harness()
  controller.handleInput({
    target: child,
    inputType: 'deleteContentBackward',
    isComposing: false,
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].metadata.preserveSourceProjection, true)
})

test('IME composition commits once after compositionend', async () => {
  const { calls, child, controller } = harness()
  controller.handleCompositionStart({ target: child })
  controller.handleInput({ target: child, inputType: 'insertCompositionText', isComposing: true })
  controller.handleInput({ target: child, inputType: 'insertCompositionText', isComposing: true })
  assert.equal(calls.length, 0)

  controller.handleCompositionEnd({ target: child })
  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })
  await Promise.resolve()

  assert.equal(calls.length, 1)
  assert.equal(calls[0].metadata.historyGroup, 'native:b1:text:composition:1')
  assert.equal(calls[0].metadata.preserveSourceProjection, true)
})

test('events outside registered editable fields are ignored', () => {
  const { calls, controller } = harness()
  controller.handleInput({
    target: { parentNode: null },
    inputType: 'insertText',
    isComposing: false,
  })
  assert.equal(calls.length, 0)
})

test('read-only runtime ignores native input', () => {
  const { calls, child, runtime, controller } = harness()
  runtime.readOnly = true
  controller.handleInput({ target: child, inputType: 'insertText', isComposing: false })
  assert.equal(calls.length, 0)
})
