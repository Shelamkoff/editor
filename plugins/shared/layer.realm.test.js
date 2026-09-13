// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { createPluginLayer } from './layer.js'

test('plugin layer accepts a block from the owner element realm', () => {
  const attributes = new Map()
  const block = {
    setAttribute(name, value) { attributes.set(name, value) },
    removeAttribute(name) { attributes.delete(name) },
  }
  const owner = {
    closest(selector) {
      assert.equal(selector, '.oe-block')
      return block
    },
  }
  const signal = {
    aborted: false,
    addEventListener() {},
  }

  const previousHTMLElement = globalThis.HTMLElement
  globalThis.HTMLElement = class AmbientHTMLElement {}
  try {
    const layer = createPluginLayer(owner, signal)
    layer.open()
    assert.equal(attributes.get('data-oe-layer-open'), 'true')
    layer.close()
    assert.equal(attributes.has('data-oe-layer-open'), false)
  } finally {
    globalThis.HTMLElement = previousHTMLElement
  }
})
