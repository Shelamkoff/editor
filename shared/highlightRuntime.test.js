import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getHighlightRuntime,
  highlightCode,
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
