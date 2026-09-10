// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { EditorRenderer } from './index.js'

const base = { injectStyles: false, blockTypes: [] }

test('renderer rejects runtime config values outside its public type contract', () => {
  const invalid = [
    [{ classPrefix: 42 }, /classPrefix must be a string/],
    [{ throwOnUnknown: 'false' }, /throwOnUnknown must be a boolean/],
    [{ theme: 'drak' }, /theme must be "dark" or "light"/],
    [{ onValidationError: 'ignore' }, /onValidationError must be a function/],
    [{ locale: [] }, /locale must be an object/],
    [{ blockTypes: 'paragraph' }, /blockTypes must be an array/],
    [{ blockConfigs: [] }, /blockConfigs must be an object/],
    [{ inlinePlugins: {} }, /inlinePlugins must be an array/],
  ]

  for (const [config, pattern] of invalid) {
    assert.throws(() => new EditorRenderer({ ...base, ...config }), pattern)
  }

  assert.doesNotThrow(() => new EditorRenderer({
    ...base,
    classPrefix: 'article',
    throwOnUnknown: false,
    theme: 'light',
    onValidationError() {},
    locale: {},
    blockConfigs: {},
    inlinePlugins: [],
  }))
})
