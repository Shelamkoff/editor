// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { BlockSettingsMenu } from './BlockSettingsMenu.js'

test('block settings menu lifecycle stays in the editor owning realm', () => {
  const documentListeners = new Map()
  const frames = []
  let focused = 0
  const ownerWindow = {
    innerWidth: 1200,
    innerHeight: 800,
    getSelection() { return { rangeCount: 0 } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length },
  }
  const ownerDocument = {
    defaultView: ownerWindow,
    createElement(tag) {
      return {
        ownerDocument,
        tagName: tag.toUpperCase(),
        style: {},
        className: '',
        classList: { add() {}, remove() {} },
        setAttribute() {},
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        querySelector() { return null },
        querySelectorAll() { return [] },
        contains() { return false },
        focus() { focused++ },
        remove() {},
        innerHTML: '',
      }
    },
    addEventListener(type, handler) { documentListeners.set(type, handler) },
    removeEventListener(type, handler) {
      if (documentListeners.get(type) === handler) documentListeners.delete(type)
    },
    querySelector() { return null },
  }
  const root = {
    ownerDocument,
    appendChild() {},
    querySelector() { return null },
    closest() { return null },
  }
  const blocks = {
    getCurrentBlock() { return null },
    getCurrentIndex() { return -1 },
    getBlockCount() { return 0 },
  }
  const menu = new BlockSettingsMenu(
    root,
    blocks,
    {},
    new Map(),
    { t(key) { return key } },
    {},
    { range: null },
    {},
    'paragraph',
    () => undefined,
    {},
  )

  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const previousRaf = globalThis.requestAnimationFrame
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.requestAnimationFrame = () => { throw new Error('ambient requestAnimationFrame must not be used') }
  try {
    assert.equal(documentListeners.has('click'), true)
    menu.toggle()
    assert.equal(frames.length, 1)
    frames.shift()()
    assert.equal(focused, 1)
    menu.destroy()
    assert.equal(documentListeners.size, 0)
  } finally {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    globalThis.requestAnimationFrame = previousRaf
  }
})
