import test from 'node:test'
import assert from 'node:assert/strict'

import { InlineCommandController } from './InlineCommandController.js'

function harness() {
  const calls = []
  const carets = []
  let preparing = false
  const runtime = {
    prepareExtensionValue(operation) {
      preparing = true
      try { return operation() }
      finally { preparing = false }
    },
    readOnly: false,
    insertInlineWidget() {},
    interact(_name, operation) { return operation() },
    replaceRichTextWithInlineSegments(blockId, fieldKey, range, segments) {
      calls.push({ blockId, fieldKey, range, segments })
      const logicalLength = segments.reduce((total, segment) => (
        total + (segment.kind === 'widget' ? 1 : segment.text.length)
      ), 0)
      return { blockId, fieldKey, offset: range.start + logicalLength }
    },
  }
  const definition = {
    paste: {
      patterns: [/^#[0-9a-f]{3}$/i, /^#[0-9a-f]{6}$/i],
      fromMatch(match) { return { value: match.toLowerCase() } },
    },
  }
  const registry = {
    inlineTypes: ['color'],
    getInlineDefinition(type) { return type === 'color' ? definition : undefined },
  }
  const selection = {
    capture() {
      return {
        anchor: { blockId: 'a', fieldKey: 'text', offset: 2 },
        focus: { blockId: 'a', fieldKey: 'text', offset: 2 },
      }
    },
    setCaret(blockId, target) { carets.push({ blockId, target }); return true },
  }
  const controller = new InlineCommandController({ runtime, registry, selection })
  return { controller, runtime, calls, carets, definition, isPreparing: () => preparing }
}

test('pasteText chooses the longest overlapping pattern and keeps surrounding text', () => {
  const { controller, calls, carets } = harness()

  assert.equal(controller.pasteText('#ff0000 tail'), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    blockId: 'a',
    fieldKey: 'text',
    range: { start: 2, end: 2 },
    segments: [
      { kind: 'widget', type: 'color', data: { value: '#ff0000' } },
      { kind: 'text', text: ' tail' },
    ],
  })
  assert.deepEqual(carets, [{
    blockId: 'a',
    target: { fieldKey: 'text', offset: 8 },
  }])
})

test('pasteText converts multiple non-overlapping matches in registration order', () => {
  const { controller, calls } = harness()

  assert.equal(controller.pasteText('#f00 mid #00ff00 tail'), true)
  assert.deepEqual(calls[0].segments, [
    { kind: 'widget', type: 'color', data: { value: '#f00' } },
    { kind: 'text', text: ' mid ' },
    { kind: 'widget', type: 'color', data: { value: '#00ff00' } },
    { kind: 'text', text: ' tail' },
  ])
})

test('pasteText leaves unmatched text to the normal clipboard path', () => {
  const { controller, calls, carets } = harness()

  assert.equal(controller.pasteText('plain text'), false)
  assert.deepEqual(calls, [])
  assert.deepEqual(carets, [])
})

test('throwing inline matcher fails the owned Paste before any mutation', () => {
  const { controller, definition, isPreparing, calls } = harness()
  definition.paste.fromMatch = () => {
    assert.equal(isPreparing(), true)
    throw new Error('matcher failed')
  }
  assert.throws(() => controller.pasteText('#fff'), /matcher failed/)
  assert.equal(calls.length, 0)
})

test('async inline matcher result cannot become a persisted widget payload', () => {
  const { controller, definition, calls } = harness()
  definition.paste.fromMatch = () => Promise.resolve({ value: '#fff' })
  assert.throws(() => controller.pasteText('#fff'), /synchron|thenable/i)
  assert.equal(calls.length, 0)
})

test('accessor-backed inline matcher result is captured under preparation guard', () => {
  const { controller, definition, isPreparing, calls } = harness()
  definition.paste.fromMatch = () => ({
    get value() {
      assert.equal(isPreparing(), true)
      throw new Error('paste payload getter failed')
    },
  })
  assert.throws(() => controller.pasteText('#fff'), /paste payload getter failed/)
  assert.equal(calls.length, 0)
})

test('inline insertion default is prepared before entering a model command', () => {
  const { controller, definition, isPreparing, calls } = harness()
  definition.schema = { createDefault: () => ({ value: '#fff' }) }
  definition.insertion = {
    createInitial() {
      assert.equal(isPreparing(), true)
      throw new Error('initial insertion failed')
    },
  }
  assert.throws(() => controller.insert('color'), /initial insertion failed/)
  assert.equal(calls.length, 0)
})

test('trigger encoding is guarded before invoking the insertion command', () => {
  const { controller, definition, isPreparing, calls } = harness()
  definition.schema = {
    encode() {
      assert.equal(isPreparing(), true)
      throw new Error('trigger encoding failed')
    },
  }
  assert.throws(() => controller.commitTrigger('color', {
    blockId: 'a', fieldKey: 'text', range: { start: 0, end: 0 },
  }, { value: '#fff' }), /trigger encoding failed/)
  assert.equal(calls.length, 0)
})

test('refused inline widget insert does not claim success or move the caret', () => {
  const { controller, runtime, definition, carets } = harness()
  definition.schema = { createDefault: () => ({ value: '#fff' }) }
  runtime.insertInlineWidget = () => false

  assert.equal(controller.insert('color'), false,
    'a rejected insertion was still reported successful')
  assert.deepEqual(carets, [], 'rejected widget insert displaced the caret')
})

test('refused trigger widget insert keeps its trigger session alive', () => {
  const { controller, runtime, definition, carets } = harness()
  definition.schema = { encode: data => ({ dataVersion: 1, data }) }
  runtime.insertInlineWidget = () => false

  assert.equal(controller.commitTrigger('color', {
    blockId: 'a', fieldKey: 'text', range: { start: 0, end: 2 },
  }, { value: '#fff' }), false,
  'a failed widget insertion made the trigger controller retire its query')
  assert.deepEqual(carets, [])
})

test('a successful widget insertion preserves the expected caret and true return', () => {
  const { controller, runtime, definition, carets } = harness()
  definition.schema = { createDefault: () => ({ value: '#fff' }) }
  runtime.insertInlineWidget = () => 'inline-1'

  assert.equal(controller.insert('color'), true)
  assert.deepEqual(carets, [{ blockId: 'a', target: { fieldKey: 'text', offset: 3 } }])
})

test('fresh inline text insertion succeeds when its rich-text command returns void', () => {
  const { controller, runtime, definition, carets } = harness()
  let replacements = 0
  runtime.replaceRichText = () => { replacements++ }
  definition.insertion = { createInitial: () => ({ kind: 'text', text: 'Hello' }) }
  assert.equal(controller.insert('color'), true)
  assert.equal(replacements, 1)
  assert.deepEqual(carets, [{ blockId: 'a', target: { fieldKey: 'text', offset: 7 } }])
})

test('rejected fresh inline text insertion cannot fire the success observer', () => {
  const calls = []
  const { controller, runtime, definition, carets } = harness()
  runtime.replaceRichText = () => false
  definition.insertion = { createInitial: () => ({ kind: 'text', text: 'Hello' }) }
  // A failed authoring transaction must not act like fresh text for triggers.
  const runtimeResult = controller.insert('color')
  assert.equal(runtimeResult, false)
  assert.deepEqual(carets, [])
})
