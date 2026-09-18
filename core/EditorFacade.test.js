// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import { DocumentSnapshotStore } from './DocumentSnapshotStore.js'
import { EditorFacade } from './EditorFacade.js'

function createBlock(id, readData) {
  let saveCalls = 0
  const block = {
    id,
    type: 'test',
    version: 0,
    plugin: {
      type: 'test',
      validate: () => true,
    },
    save() {
      saveCalls++
      return {
        id,
        type: 'test',
        data: readData(),
      }
    },
    get saveCalls() {
      return saveCalls
    },
  }
  return block
}

function createStore(blocks) {
  const blockReader = {
    [Symbol.iterator]() {
      return blocks[Symbol.iterator]()
    },
  }

  return new DocumentSnapshotStore(/** @type {any} */ (blockReader), null, {})
}

test('snapshot cache serializes only blocks whose version changed', () => {
  let value = 'first'
  const block = createBlock('a', () => ({ nested: { value } }))
  const store = createStore([block])

  const first = store.capture()
  const second = store.capture()

  assert.equal(block.saveCalls, 1)
  assert.equal(first.blocks[0], second.blocks[0])

  value = 'second'
  block.version++
  const third = store.capture()

  assert.equal(block.saveCalls, 2)
  assert.notEqual(third.blocks[0], second.blocks[0])
  assert.equal(third.blocks[0].data.nested.value, 'second')
})

test('public save result cannot mutate a cached internal snapshot', () => {
  const block = createBlock('a', () => ({ nested: { value: 'safe' } }))
  const store = createStore([block])

  const publicDocument = store.save()
  publicDocument.blocks[0].data.nested.value = 'mutated'

  const next = store.save()
  assert.equal(next.blocks[0].data.nested.value, 'safe')
  assert.equal(block.saveCalls, 1)
})

test('block save failure aborts the document transaction', () => {
  const valid = createBlock('valid', () => ({ value: 'kept' }))
  const broken = createBlock('broken', () => {
    throw new Error('plugin failed')
  })
  const store = createStore([valid, broken])

  assert.throws(
    () => store.save(),
    /Failed to save block broken \(test\)/,
  )
})

test('destroy releases plugin-owned blocks before shared editor services', () => {
  const order = []
  const blocks = {
    clear() { order.push('blocks') },
  }
  const events = {
    emit() { order.push('event') },
    clear() { order.push('events') },
  }
  const root = {
    remove() { order.push('root') },
  }
  const diagnostics = {
    emit() {},
    errorName() { return 'Error' },
  }
  const facade = new EditorFacade(
    /** @type {any} */ (root),
    /** @type {any} */ ({
      blocks,
      selection: {},
      events,
      defaultBlockType: 'paragraph',
      commands: {},
      documentSchema: {},
      diagnostics,
      snapshots: {},
      publicBlocks: {},
      publicEvents: {},
      readOnly: false,
    }),
  )
  facade.registerDestroyable({ destroy() { order.push('shared') } })

  facade.destroy()

  assert.deepEqual(order, ['blocks', 'shared', 'event', 'events', 'root'])
})

test('inline plugin insertion reads selection from the editor owning window', () => {
  class FakeElement {
    constructor(ownerDocument) {
      this.ownerDocument = ownerDocument
      this.nodeType = 1
      this.contentEditable = 'true'
      this.childNodes = []
      this.dataset = {}
      this.parentElement = null
    }
    contains(node) { return node === this }
    querySelectorAll() { return [] }
    matches(selector) { return selector === '[contenteditable]' }
    closest(selector) { return selector === '[contenteditable]' ? this : null }
  }

  let field
  const range = {
    get commonAncestorContainer() { return field },
    get startContainer() { return field },
    get endContainer() { return field },
    startOffset: 0,
    endOffset: 0,
  }
  const ownerSelection = {
    rangeCount: 1,
    getRangeAt() { return range },
  }
  const ownerDocument = {
    defaultView: {
      getSelection() { return ownerSelection },
    },
  }
  field = new FakeElement(ownerDocument)
  const root = new FakeElement(ownerDocument)
  root.contains = node => node === field

  let inserts = 0
  const plugin = {
    type: 'mention',
    mapTextFields() {},
    insertFresh() { inserts++ },
  }
  const registry = {
    get(type) { return type === 'mention' ? plugin : undefined },
  }
  const block = { id: 'block', plugin, contentElement: field }
  const blocks = {
    getBlockByChildNode(node) { return node === field ? block : undefined },
  }
  const commands = {
    runForBlock(target, callback) {
      assert.equal(target, block)
      return callback()
    },
  }
  const facade = new EditorFacade(
    /** @type {any} */ (root),
    /** @type {any} */ ({
      blocks,
      selection: {},
      events: {},
      defaultBlockType: 'paragraph',
      commands,
      documentSchema: {},
      diagnostics: {},
      snapshots: {},
      publicBlocks: {},
      publicEvents: {},
      readOnly: false,
      inlinePluginRegistry: registry,
      inlinePluginCtx: {},
    }),
  )

  const previousWindow = globalThis.window
  const previousNode = globalThis.Node
  const previousHTMLElement = globalThis.HTMLElement
  globalThis.window = {
    getSelection() {
      throw new Error('ambient selection must not be read')
    },
  }
  globalThis.Node = { ELEMENT_NODE: 1 }
  globalThis.HTMLElement = FakeElement
  try {
    assert.equal(facade.insertInlinePlugin('mention'), true)
    assert.equal(inserts, 1)
  } finally {
    globalThis.window = previousWindow
    globalThis.Node = previousNode
    globalThis.HTMLElement = previousHTMLElement
  }
})


test('history restore is unavailable during an active command transaction', () => {
  let undoCalls = 0
  let redoCalls = 0
  const facade = new EditorFacade(
    /** @type {any} */ ({ remove() {} }),
    /** @type {any} */ ({
      blocks: {},
      selection: {},
      events: {},
      defaultBlockType: 'paragraph',
      commands: { active: true },
      documentSchema: {},
      diagnostics: {},
      snapshots: {},
      publicBlocks: {},
      publicEvents: {},
      readOnly: false,
    }),
  )
  facade.configureHistory({
    canUndo: true,
    canRedo: true,
    undo() { undoCalls++; return true },
    redo() { redoCalls++; return true },
  })

  assert.equal(facade.canUndo, false)
  assert.equal(facade.canRedo, false)
  assert.equal(facade.undo(), false)
  assert.equal(facade.redo(), false)
  assert.equal(undoCalls, 0)
  assert.equal(redoCalls, 0)
})

test('destroy rejects teardown during an active command transaction', () => {
  let cleared = 0
  let removed = 0
  const facade = new EditorFacade(
    /** @type {any} */ ({ remove() { removed++ } }),
    /** @type {any} */ ({
      blocks: { clear() { cleared++ } },
      selection: {},
      events: { emit() {}, clear() {} },
      defaultBlockType: 'paragraph',
      commands: { active: true },
      documentSchema: {},
      diagnostics: { emit() {}, errorName() { return 'Error' } },
      snapshots: {},
      publicBlocks: {},
      publicEvents: {},
      readOnly: false,
    }),
  )

  assert.throws(() => facade.destroy(), /active command/i)
  assert.equal(cleared, 0)
  assert.equal(removed, 0)
})
