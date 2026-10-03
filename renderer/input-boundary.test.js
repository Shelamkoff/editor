// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase()
    this.className = ''
    this.dataset = {}
    this.style = {}
    this.childNodes = []
    this.parentNode = null
  }
  get children() { return this.childNodes }
  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child }
  querySelectorAll() { return [] }
}

globalThis.HTMLElement = FakeElement
globalThis.document = { createElement: tagName => new FakeElement(tagName) }

const passthroughSchema = Object.freeze({
  currentVersion: 1,
  createDefault: () => ({}),
  decode({ dataVersion, data }) {
    if (dataVersion !== 1) throw new RangeError('unsupported data version')
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('data must be an object')
    return { dataVersion: 1, data: structuredClone(data) }
  },
  encode(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('data must be an object')
    return { dataVersion: 1, data: structuredClone(data) }
  },
})

const block = (overrides = {}) => ({
  id: 'block-1',
  type: 'custom',
  dataVersion: 1,
  data: {},
  ...overrides,
})

const documentData = blocks => ({ version: '2.0.0', blocks })

test('renderer public methods enforce the canonical current document and block envelope', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], throwOnUnknown: false, injectStyles: false })
  renderer.registerRenderer({ type: 'custom', schema: passthroughSchema, render() { return document.createElement('article') } })
  const container = document.createElement('main')

  assert.throws(() => renderer.render({ blocks: [] }), /version is required/)
  assert.throws(() => renderer.render({ version: '1.0.0', blocks: [] }), RangeError)
  assert.throws(() => renderer.renderTo({ version: '2.0.0', blocks: {} }, container), /blocks must be an array/)
  assert.throws(() => renderer.renderBlock(null), /block must be a JSON object/)
  assert.throws(() => renderer.renderBlock(block({ id: '' })), /id must be a non-empty string/)
  assert.throws(() => renderer.renderBlock(block({ type: '' })), /type must be a non-empty string/)
  assert.throws(() => renderer.renderBlock({ id: 'x', type: 'custom', data: {} }), /dataVersion is required/)
  assert.throws(() => renderer.renderBlock(block({ data: null })), /data must be a JSON object/)
  assert.throws(() => renderer.renderBlock(block({ data: [] })), /data must be a JSON object/)

  assert.equal(renderer.render(documentData([block()])).children.length, 1)
})

test('renderer document boundary rejects sparse block arrays without reading inherited entries', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], throwOnUnknown: false, injectStyles: false })
  let reads = 0
  const prototype = Object.create(Array.prototype)
  Object.defineProperty(prototype, '0', {
    configurable: true,
    get() { reads++; throw new Error('inherited block entry accessed') },
  })
  const blocks = []
  Object.setPrototypeOf(blocks, prototype)
  blocks.length = 1
  assert.throws(() => renderer.render(documentData(blocks)), /dense array/i)
  assert.equal(reads, 0)
})

test('renderer snapshots the JSON block boundary before custom renderers observe data', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  let seen
  renderer.registerRenderer({
    schema: passthroughSchema,
    type: 'custom',
    render(input) { seen = input; return document.createElement('article') },
  })

  assert.throws(
    () => renderer.renderBlock(block({ data: { value: undefined } })),
    /non-JSON undefined/,
  )
  assert.equal(seen, undefined)

  let reads = 0
  const prototype = {}
  Object.defineProperty(prototype, 'type', {
    configurable: true,
    get() { reads++; throw new Error('inherited block type accessed') },
  })
  const invalid = Object.create(prototype)
  invalid.id = 'foreign-class'
  invalid.dataVersion = 1
  invalid.data = {}
  assert.throws(() => renderer.renderBlock(invalid), /JSON object/)
  assert.equal(reads, 0)
})
