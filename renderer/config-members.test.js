// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorRenderer } from './index.js'

test('renderer config rejects unknown block types and malformed inline plugin entries', () => {
  assert.throws(
    () => new EditorRenderer({ blockTypes: ['missing'] }),
    /unknown block type/i,
  )
  assert.throws(
    () => new EditorRenderer({ inlinePlugins: [{}] }),
    /inline plugin.*non-empty string type/i,
  )
  assert.throws(
    () => new EditorRenderer({ inlinePlugins: [{ type: 'mention', createWidget() {} }] }),
    /inline plugin "mention" must implement createWidget\(\) and getData\(\)/i,
  )
  assert.throws(
    () => new EditorRenderer({ inlinePlugins: [
      { type: 'mention', createWidget() {}, getData() {} },
      { type: 'mention', createWidget() {}, getData() {} },
    ] }),
    /duplicate renderer inline plugin type/i,
  )
})

test('registerRenderer rejects malformed custom renderer contracts before registration', () => {
  const renderer = new EditorRenderer({ blockTypes: [] })
  assert.throws(() => renderer.registerRenderer(null), /custom renderer must be an object/i)
  assert.throws(() => renderer.registerRenderer({ type: '', render() {} }), /non-empty string type/i)
  assert.throws(() => renderer.registerRenderer({ type: 'custom' }), /must implement render\(\)/i)
  assert.throws(() => renderer.registerRenderer({ type: 'custom', render() {}, styles: 'x.css' }), /styles must be an array of strings/i)
  assert.equal(renderer.hasRenderer('custom'), false)
})

test('renderer config ignores inherited top-level options', () => {
  let reads = 0
  const prototype = {}
  Object.defineProperty(prototype, 'injectStyles', {
    configurable: true,
    get() { reads++; throw new Error('inherited renderer option accessed') },
  })
  const config = Object.create(prototype)
  config.blockTypes = []
  assert.doesNotThrow(() => new EditorRenderer(config))
  assert.equal(reads, 0)
})

test('renderer config rejects sparse public arrays without reading inherited entries', () => {
  for (const field of ['blockTypes', 'inlinePlugins']) {
    let reads = 0
    const prototype = Object.create(Array.prototype)
    Object.defineProperty(prototype, '0', {
      configurable: true,
      get() { reads++; throw new Error(`inherited ${field} entry accessed`) },
    })
    const values = []
    Object.setPrototypeOf(values, prototype)
    values.length = 1
    assert.throws(() => new EditorRenderer({ blockTypes: [], [field]: values }), /dense array/i, field)
    assert.equal(reads, 0, field)
  }
})
