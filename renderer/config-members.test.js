// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorRenderer } from './index.js'

const passthroughSchema = Object.freeze({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault: () => ({}),
  decode({ data }) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('data must be an object')
    return { dataVersion: 1, data: { ...data } }
  },
  encode(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('data must be an object')
    return { dataVersion: 1, data: { ...data } }
  },
})

test('renderer config rejects unknown block types and malformed inline renderer entries', () => {
  assert.throws(
    () => new EditorRenderer({ blockTypes: ['missing'] }),
    /unknown block type/i,
  )
  assert.throws(
    () => new EditorRenderer({ inlineRenderers: [{}] }),
    /inline renderer.*non-empty string type/i,
  )
  assert.throws(
    () => new EditorRenderer({ inlineRenderers: [{ type: 'mention', schema: { decode() {} } }] }),
    /inline renderer "mention" must implement render\(\)/i,
  )
  assert.throws(
    () => new EditorRenderer({ inlineRenderers: [
      { type: 'mention', schema: { decode() {} }, render() {} },
      { type: 'mention', schema: { decode() {} }, render() {} },
    ] }),
    /duplicate renderer inline renderer type/i,
  )
})

test('registerRenderer rejects malformed custom renderer contracts before registration', () => {
  const renderer = new EditorRenderer({ blockTypes: [] })
  assert.throws(() => renderer.registerRenderer(null), /custom renderer must be an object/i)
  assert.throws(() => renderer.registerRenderer({ type: '', schema: passthroughSchema, render() {} }), /non-empty string type/i)
  assert.throws(() => renderer.registerRenderer({ type: 'custom', render() {} }), /must provide a block data schema/i)
  assert.throws(() => renderer.registerRenderer({ type: 'custom', schema: passthroughSchema }), /must implement render\(\)/i)
  assert.throws(() => renderer.registerRenderer({ type: 'custom', schema: passthroughSchema, render() {}, styles: 'x.css' }), /styles must be an array of strings/i)
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
  for (const field of ['blockTypes', 'inlineRenderers']) {
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


test('registerRenderer observes accessor-backed type once', () => {
  const editorRenderer = new EditorRenderer({ blockTypes: [] })
  let reads = 0
  const custom = {
    schema: passthroughSchema,
    get type() {
      reads++
      return reads === 1 ? 'stable-custom' : 'drifted-custom'
    },
    render() {
      return /** @type {any} */ ({})
    },
  }

  editorRenderer.registerRenderer(custom)
  assert.equal(reads, 1)
  assert.equal(editorRenderer.hasRenderer('stable-custom'), true)
  assert.equal(editorRenderer.hasRenderer('drifted-custom'), false)
})


test('renderer config observes blockTypes and inlineRenderers entries once', () => {
  let blockEntryReads = 0
  const blockTypes = []
  Object.defineProperty(blockTypes, '0', {
    enumerable: true,
    configurable: true,
    get() { blockEntryReads++; return 'paragraph' },
  })
  blockTypes.length = 1

  let pluginEntryReads = 0
  let pluginTypeReads = 0
  const plugin = {
    get type() { pluginTypeReads++; return 'probe' },
    schema: { decode() { return { dataVersion: 1, data: {} } } },
    render() { return /** @type {any} */ ({}) },
  }
  const inlineRenderers = []
  Object.defineProperty(inlineRenderers, '0', {
    enumerable: true,
    configurable: true,
    get() { pluginEntryReads++; return plugin },
  })
  inlineRenderers.length = 1

  assert.doesNotThrow(() => new EditorRenderer({ blockTypes, inlineRenderers }))
  assert.equal(blockEntryReads, 1)
  assert.equal(pluginEntryReads, 1)
  assert.equal(pluginTypeReads, 1)
})




test('Poll renderer config and dataSource members are observed once', () => {
  const reads = {
    poll: 0,
    dataSource: 0,
    load: 0,
    vote: 0,
    subscribe: 0,
    onError: 0,
    compare: 0,
    maxVoters: 0,
  }
  const adapter = {
    get load() { reads.load++; return async () => ({ total: 0, options: [] }) },
    get vote() { reads.vote++; return async () => ({ total: 0, options: [] }) },
    get subscribe() { reads.subscribe++; return undefined },
  }
  const poll = {
    get dataSource() { reads.dataSource++; return adapter },
    get onError() { reads.onError++; return undefined },
    get compareRevisions() { reads.compare++; return undefined },
    get maxVoters() { reads.maxVoters++; return 25 },
  }
  const blockConfigs = {}
  Object.defineProperty(blockConfigs, 'poll', {
    enumerable: true,
    configurable: true,
    get() { reads.poll++; return poll },
  })

  assert.doesNotThrow(() => new EditorRenderer({ blockTypes: ['poll'], blockConfigs }))
  assert.deepEqual(reads, {
    poll: 1,
    dataSource: 1,
    load: 1,
    vote: 1,
    subscribe: 1,
    onError: 1,
    compare: 1,
    maxVoters: 1,
  })
})


test('unused blockConfigs members are not observed', () => {
  let pollReads = 0
  const blockConfigs = {}
  Object.defineProperty(blockConfigs, 'poll', {
    enumerable: true,
    configurable: true,
    get() {
      pollReads++
      throw new Error('unused Poll config must not be read')
    },
  })

  assert.doesNotThrow(() => new EditorRenderer({
    blockTypes: ['paragraph'],
    blockConfigs,
  }))
  assert.equal(pollReads, 0)
})
