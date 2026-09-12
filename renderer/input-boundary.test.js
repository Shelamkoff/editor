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

test('renderer public methods reject malformed document envelopes and blocks', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], throwOnUnknown: false, injectStyles: false })
  renderer.registerRenderer({ type: 'custom', render() { return document.createElement('article') } })
  const container = document.createElement('main')

  assert.throws(() => renderer.render({ blocks: 'custom' }), /blocks must be an array/)
  assert.throws(() => renderer.renderTo({ blocks: {} }, container), /blocks must be an array/)
  assert.throws(() => renderer.renderBlock(null), /block must be an object/)
  assert.throws(() => renderer.renderBlock({ type: '', data: {} }), /block type must be a non-empty string/)
  assert.throws(() => renderer.renderBlock({ type: 'custom', data: null }), /block data must be an object/)
  assert.throws(() => renderer.renderBlock({ type: 'custom', data: [] }), /block data must be an object/)

  assert.equal(renderer.render({ blocks: [{ type: 'custom', data: {} }] }).children.length, 1)
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
  assert.throws(() => renderer.render({ blocks }), /dense array/i)
  assert.equal(reads, 0)
})

test('renderer snapshots the JSON block boundary before custom renderers observe data', async () => {
  const { EditorRenderer } = await import('./index.js')
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  let seen
  renderer.registerRenderer({
    type: 'custom',
    render(block) { seen = block; return document.createElement('article') },
  })

  assert.throws(
    () => renderer.renderBlock({ type: 'custom', data: { value: undefined } }),
    /non-JSON undefined/,
  )
  assert.equal(seen, undefined)

  let reads = 0
  const prototype = {}
  Object.defineProperty(prototype, 'type', {
    configurable: true,
    get() { reads++; throw new Error('inherited block type accessed') },
  })
  const block = Object.create(prototype)
  block.data = {}
  assert.throws(() => renderer.renderBlock(block), /JSON object/)
  assert.equal(reads, 0)
})
