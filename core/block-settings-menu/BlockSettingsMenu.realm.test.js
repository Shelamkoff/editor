// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { CrossBlockSelection } from '../CrossBlockSelection.js'
import { BlockSettingsMenu } from './BlockSettingsMenu.js'

function createMenuEnvironment(selectionRange = null) {
  const documentListeners = new Map()
  const frames = []
  let focused = 0
  const highlights = new Map()
  class Highlight {
    constructor(range) { this.range = range }
  }
  const selection = {
    rangeCount: selectionRange ? 1 : 0,
    getRangeAt() { return selectionRange },
    removeAllRanges() {},
    addRange() {},
  }
  const ownerWindow = {
    innerWidth: 1200,
    innerHeight: 800,
    CSS: { highlights },
    Highlight,
    getSelection() { return selection },
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
        dataset: {},
        offsetHeight: 0,
        setAttribute() {},
        getAttribute() { return null },
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        append() {},
        querySelector() { return null },
        querySelectorAll() { return [] },
        contains() { return false },
        focus() { focused++ },
        remove() {},
        innerHTML: '',
        textContent: '',
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
  return {
    ownerDocument,
    ownerWindow,
    highlights,
    documentListeners,
    frames,
    root,
    blocks,
    get focused() { return focused },
  }
}

function createHighlightRange() {
  const highlights = new Map()
  class Highlight {
    constructor(range) { this.range = range }
  }
  const view = { CSS: { highlights }, Highlight }
  const ownerDocument = { defaultView: view }
  const startContainer = { nodeType: 3, ownerDocument, isConnected: true, parentElement: null }
  const endContainer = { nodeType: 3, ownerDocument, isConnected: true, parentElement: null }
  const range = {
    collapsed: false,
    startContainer,
    endContainer,
    cloneRange() { return this },
  }
  return { range, highlights }
}

function createMenu(env) {
  return new BlockSettingsMenu(
    env.root,
    env.blocks,
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
}

test('block settings menu lifecycle stays in the editor owning realm', () => {
  const env = createMenuEnvironment()
  const menu = createMenu(env)

  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const previousRaf = globalThis.requestAnimationFrame
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  globalThis.requestAnimationFrame = () => { throw new Error('ambient requestAnimationFrame must not be used') }
  try {
    assert.equal(env.documentListeners.has('click'), true)
    menu.toggle()
    assert.equal(env.frames.length, 1)
    env.frames.shift()()
    assert.equal(env.focused, 1)
    menu.destroy()
    assert.equal(env.documentListeners.size, 0)
  } finally {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    globalThis.requestAnimationFrame = previousRaf
  }
})

test('closing block settings menu clears only its own highlight registry', () => {
  const foreign = createHighlightRange()
  const env = createMenuEnvironment()
  const startContainer = { nodeType: 3, ownerDocument: env.ownerDocument, isConnected: true, parentElement: null }
  const endContainer = { nodeType: 3, ownerDocument: env.ownerDocument, isConnected: true, parentElement: null }
  const ownRange = {
    collapsed: false,
    startContainer,
    endContainer,
    cloneRange() { return this },
  }
  const ownSelection = env.ownerWindow.getSelection()
  ownSelection.rangeCount = 1
  ownSelection.getRangeAt = () => ownRange

  CrossBlockSelection.showHighlight(foreign.range)
  const menu = createMenu(env)
  try {
    menu.toggle()
    assert.equal(env.highlights.has('oe-cross-select'), true)
    assert.equal(foreign.highlights.has('oe-cross-select'), true)

    menu.close()

    assert.equal(env.highlights.has('oe-cross-select'), false)
    assert.equal(foreign.highlights.has('oe-cross-select'), true)
  } finally {
    menu.destroy()
    CrossBlockSelection.hideHighlight(foreign.range)
  }
})
