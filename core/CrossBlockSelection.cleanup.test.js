// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { CrossBlockSelection } from './CrossBlockSelection.js'

test('hideHighlight without a range clears only registries previously owned by the editor', () => {
  const calls = []
  class HighlightOne { constructor(range) { this.range = range } }
  class HighlightTwo { constructor(range) { this.range = range } }
  const first = {
    set(key, value) { calls.push(['set-1', key, value.range]) },
    delete(key) { calls.push(['delete-1', key]) },
  }
  const second = {
    set(key, value) { calls.push(['set-2', key, value.range]) },
    delete(key) { calls.push(['delete-2', key]) },
  }
  const rangeOne = { startContainer: { ownerDocument: { defaultView: { Highlight: HighlightOne, CSS: { highlights: first } } } } }
  const rangeTwo = { startContainer: { ownerDocument: { defaultView: { Highlight: HighlightTwo, CSS: { highlights: second } } } } }
  const previousCSS = globalThis.CSS
  globalThis.CSS = new Proxy({}, { get() { throw new Error('ambient CSS must not be used') } })
  try {
    CrossBlockSelection.showHighlight(rangeOne)
    CrossBlockSelection.showHighlight(rangeTwo)
    CrossBlockSelection.hideHighlight()
    // The active set must be drained: a second close is a no-op.
    CrossBlockSelection.hideHighlight()
  } finally {
    globalThis.CSS = previousCSS
  }

  assert.deepEqual(calls.map(call => call.slice(0, 2)), [
    ['set-1', 'oe-cross-select'],
    ['set-2', 'oe-cross-select'],
    ['delete-1', 'oe-cross-select'],
    ['delete-2', 'oe-cross-select'],
  ])
})
