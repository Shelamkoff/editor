import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getHighlightRuntime,
  highlightCode,
  loadHighlightRuntime,
  setHighlightRuntime,
} from './highlightRuntime.js'

test('highlight runtime uses an explicitly selected registered language', () => {
  const runtime = {
    getLanguage: language => language === 'javascript',
    highlight: (code, options) => ({
      value: options.language + ':' + code,
    }),
    highlightAuto: () => {
      throw new Error('automatic detection must not run')
    },
  }

  setHighlightRuntime(runtime)

  assert.equal(getHighlightRuntime(), runtime)
  assert.deepEqual(highlightCode('const value = 1', 'javascript'), {
    value: 'javascript:const value = 1',
    language: 'javascript',
  })
})

test('highlight runtime falls back to automatic language detection', () => {
  setHighlightRuntime({
    getLanguage: () => false,
    highlight: () => {
      throw new Error('explicit highlighting must not run')
    },
    highlightAuto: code => ({
      value: 'auto:' + code,
      language: 'typescript',
    }),
  })

  assert.deepEqual(highlightCode('const value: number = 1', 'unknown'), {
    value: 'auto:const value: number = 1',
    language: 'typescript',
  })
})
test('explicit highlighter remains authoritative after an earlier lazy load resolves', async () => {
  const original = getHighlightRuntime()
  const preferred = {
    getLanguage: () => true,
    highlight: () => ({ value: 'from-explicit-provider' }),
    highlightAuto: () => ({ value: 'from-explicit-provider' }),
  }
  try {
    setHighlightRuntime(null)
    const pending = loadHighlightRuntime()
    // Module import settles asynchronously; this assignment is the newest
    // explicit user choice even if the old import resolves later.
    setHighlightRuntime(preferred)
    assert.equal(await pending, preferred)
    assert.equal(getHighlightRuntime(), preferred)
    assert.deepEqual(highlightCode('test', 'javascript'), {
      value: 'from-explicit-provider', language: 'javascript',
    })
  } finally {
    setHighlightRuntime(original)
  }
})

test('clearing a completed lazy highlighter allows it to be loaded again', async () => {
  const original = getHighlightRuntime()
  try {
    setHighlightRuntime(null)
    const first = await loadHighlightRuntime()
    assert.equal(getHighlightRuntime(), first)
    setHighlightRuntime(null)
    const second = await loadHighlightRuntime()
    assert.equal(getHighlightRuntime(), second)
    assert.equal(typeof second.highlightAuto, 'function')
  } finally {
    setHighlightRuntime(original)
  }
})
