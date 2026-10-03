// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditor } from './index.js'

class FakeHolder {}

const invalidCases = [
  ['autofocus', 'yes', /autofocus must be a boolean/],
  ['inlinePlugins', {}, /inlinePlugins must be an array/],
  ['migrations', {}, /migrations must be an array/],
  ['defaultBlock', 42, /defaultBlock must be a non-empty string/],
  ['defaultBlock', '', /defaultBlock must be a non-empty string/],
  ['locale', [], /locale must be an object/],
  ['onChange', 'later', /onChange must be a function/],
  ['onReady', 'later', /onReady must be a function/],
  ['onValidationError', 'later', /onValidationError must be a function/],
  ['onDiagnostic', 'later', /onDiagnostic must be a function/],
  ['diagnosticThresholds', [], /diagnosticThresholds must be an object/],
  ['theme', 'custom', /theme must be "light" or "dark"/],
  ['readOnly', 'yes', /readOnly must be a boolean/],
  ['injectStyles', 'yes', /injectStyles must be a boolean/],
  ['placeholder', 42, /placeholder must be a string/],
  ['minHeight', -1, /minHeight must be a finite number/],
  ['changeDebounceMs', -1, /changeDebounceMs must be a finite number/],
  ['historyCoalesceMs', -1, /historyCoalesceMs must be a finite number/],
  ['dragThreshold', -1, /dragThreshold must be a finite number/],
  ['historyMaxStack', 0, /historyMaxStack must be a positive safe integer/],
  ['toolboxFilterThreshold', -1, /toolboxFilterThreshold must be a non-negative safe integer/],
  ['mobileBreakpoint', -1, /mobileBreakpoint must be a finite number/],
  ['blockInsertAnimationMs', -1, /blockInsertAnimationMs must be a finite number/],
  ['blockMoveAnimationMs', Number.NaN, /blockMoveAnimationMs must be a finite number/],
  ['blockRemoveAnimationMs', Number.POSITIVE_INFINITY, /blockRemoveAnimationMs must be a finite number/],
  ['validationMode', 'loose', /validationMode must be/],
  ['documentVersionPolicy', 'loose', /documentVersionPolicy must be/],
]

test('createEditor rejects malformed v2 runtime option shapes at the public boundary', () => {
  const previous = globalThis.HTMLElement
  globalThis.HTMLElement = FakeHolder
  try {
    for (const [field, value, error] of invalidCases) {
      assert.throws(
        () => createEditor({ holder: new FakeHolder(), plugins: [{}], [field]: value }),
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
    assert.throws(() => createEditor(config), /non-empty plugins array/)
    assert.equal(reads, 0)
  } finally {
    globalThis.HTMLElement = previous
  }
})

test('createEditor rejects sparse v2 extension arrays without reading inherited entries', () => {
  const previous = globalThis.HTMLElement
  globalThis.HTMLElement = FakeHolder
  try {
    for (const field of ['plugins', 'inlinePlugins', 'migrations']) {
      let reads = 0
      const prototype = Object.create(Array.prototype)
      Object.defineProperty(prototype, '0', {
        configurable: true,
        get() { reads++; throw new Error(`inherited ${field} entry accessed`) },
      })
      const values = []
      Object.setPrototypeOf(values, prototype)
      values.length = 1
      const config = { holder: new FakeHolder(), plugins: [{}], [field]: values }
      assert.throws(() => createEditor(config), /dense array/i, field)
      assert.equal(reads, 0, field)
    }
  } finally {
    globalThis.HTMLElement = previous
  }
})

test('createEditor accepts a holder from its owning browsing realm', () => {
  class AmbientElement {}
  class ForeignElement {
    constructor(ownerDocument) { this.ownerDocument = ownerDocument }
  }
  const ownerDocument = { defaultView: { HTMLElement: ForeignElement } }
  const holder = new ForeignElement(ownerDocument)
  const previous = globalThis.HTMLElement
  globalThis.HTMLElement = AmbientElement
  try {
    assert.throws(() => createEditor({ holder, plugins: [] }), /non-empty plugins array/)
  } finally {
    globalThis.HTMLElement = previous
  }
})

test('createEditor observes accessor-backed plugin array entries once', () => {
  const previous = globalThis.HTMLElement
  globalThis.HTMLElement = FakeHolder
  let reads = 0
  const definition = {
    type: 'probe',
    label: { key: 'title', fallback: 'Probe' },
    icon: '',
    schema: {
      currentVersion: 1,
      legacyVersion: 1,
      createDefault: () => ({}),
      decode: ({ data }) => ({ dataVersion: 1, data }),
      encode: data => ({ dataVersion: 1, data: { ...data } }),
    },
    setup() { return { create() { throw new Error('synthetic setup stop') }, destroy() {} } },
  }
  const plugins = []
  Object.defineProperty(plugins, '0', {
    enumerable: true,
    configurable: true,
    get() {
      reads++
      if (reads > 1) throw new Error('plugin entry was observed more than once')
      return definition
    },
  })
  plugins.length = 1

  try {
    assert.throws(() => createEditor({ holder: new FakeHolder(), plugins, defaultBlock: 'probe' }))
    assert.equal(reads, 1)
  } finally {
    globalThis.HTMLElement = previous
  }
})
