// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditor } from './index.js'

class FakeHolder {}

const invalidCases = [
  ['autofocus', 'yes', /autofocus must be a boolean/],
  ['inlineTools', {}, /inlineTools must be an array/],
  ['inlinePlugins', {}, /inlinePlugins must be an array/],
  ['migrations', {}, /migrations must be an array/],
  ['defaultBlock', 42, /defaultBlock must be a non-empty string/],
  ['defaultBlock', '', /defaultBlock must be a non-empty string/],
  ['locale', [], /locale must be an object/],
  ['onChange', 'later', /onChange must be a function/],
  ['onReady', 'later', /onReady must be a function/],
  ['onValidationError', 'later', /onValidationError must be a function/],
  ['onDiagnostic', 'later', /onDiagnostic must be a function/],
  ['diagnosticThresholds', null, /diagnosticThresholds must be an object/],
  ['theme', 42, /theme must be a non-empty string/],
  ['theme', '', /theme must be a non-empty string/],
]

test('createEditor rejects malformed runtime option shapes at the public boundary', () => {
  const previous = globalThis.HTMLElement
  globalThis.HTMLElement = FakeHolder
  try {
    for (const [field, value, error] of invalidCases) {
      assert.throws(
        () => createEditor({ holder: new FakeHolder(), plugins: [], [field]: value }),
        error,
        field,
      )
    }
  } finally {
    globalThis.HTMLElement = previous
  }
})

test('createEditor ignores inherited top-level options', () => {
  const previous = globalThis.HTMLElement
  globalThis.HTMLElement = FakeHolder
  let reads = 0
  const prototype = {}
  Object.defineProperty(prototype, 'autofocus', {
    configurable: true,
    get() { reads++; throw new Error('inherited option accessed') },
  })
  const config = Object.create(prototype)
  config.holder = new FakeHolder()
  config.plugins = []
  try {
    assert.throws(() => createEditor(config), /Default block plugin/)
    assert.equal(reads, 0)
  } finally {
    globalThis.HTMLElement = previous
  }
})

test('createEditor rejects sparse plugin configuration arrays without reading inherited entries', () => {
  const previous = globalThis.HTMLElement
  globalThis.HTMLElement = FakeHolder
  try {
    for (const field of ['plugins', 'inlineTools', 'inlinePlugins', 'migrations']) {
      let reads = 0
      const prototype = Object.create(Array.prototype)
      Object.defineProperty(prototype, '0', {
        configurable: true,
        get() { reads++; throw new Error(`inherited ${field} entry accessed`) },
      })
      const values = []
      Object.setPrototypeOf(values, prototype)
      values.length = 1
      const config = { holder: new FakeHolder(), plugins: [], [field]: values }
      assert.throws(() => createEditor(config), /dense array/i, field)
      assert.equal(reads, 0, field)
    }
  } finally {
    globalThis.HTMLElement = previous
  }
})
