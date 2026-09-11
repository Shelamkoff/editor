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
