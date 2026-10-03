import test from 'node:test'
import assert from 'node:assert/strict'

import { InlineCommandController } from './InlineCommandController.js'

function harness() {
  const calls = []
  const carets = []
  const runtime = {
    readOnly: false,
    insertInlineWidget() {},
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
  return { controller, runtime, calls, carets }
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
