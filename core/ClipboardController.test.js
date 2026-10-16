import test from 'node:test'
import assert from 'node:assert/strict'

import { ClipboardController } from './ClipboardController.js'
import { CLIPBOARD_FRAGMENT_MIME } from './ClipboardFragment.js'

function clipboardHarness({ formats = [], read = () => '', files = [], accepts = null, resolve = null, capability = null } = {}) {
  const handlers = new Map()
  const host = { contains: () => true }
  const target = {
    closest(selector) {
      return selector === '[contenteditable="true"]' && accepts ? host : null
    },
  }
  const owner = accepts
    ? { blockId: 'a', fieldKey: 'text', mode: 'rich-text', element: host }
    : null
  const root = {
    ownerDocument: { defaultView: { AbortController } },
    contains: () => true,
    addEventListener(type, handler) { handlers.set(type, handler) },
  }
  const bookmark = {
    anchor: { blockId: 'a', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'a', fieldKey: 'text', offset: 0 },
  }
  let preparing = false
  const runtime = {
    readOnly: false,
    generation: 1,
    revision: 0,
    has: id => id === 'a',
    get: () => ({ id: 'a', type: 'paragraph' }),
    interact(_name, operation, selectionAfter) {
      const result = operation()
      selectionAfter?.(result)
      return result
    },
    prepareExtensionValue(operation) {
      assert.equal(preparing, false)
      preparing = true
      try { return operation() }
      finally { preparing = false }
    },
  }
  const registry = {
    blockTypes: ['paragraph'],
    getBlockDefinition: () => ({
      capabilities: {
        paste: capability ?? {
          accepts(input) { return accepts(input, () => preparing) },
          resolve: resolve ?? (() => new Promise(() => {})),
        },
      },
    }),
  }
  const controller = new ClipboardController({
    root,
    runtime,
    registry,
    reconciler: {
      resolveEditableTarget: () => owner,
      getEditableFields: () => [{ key: 'text', mode: 'rich-text', element: {} }],
    },
    selection: { capture: () => bookmark },
    view: { reconcileInteraction() {}, setCurrent() {}, focus() {} },
  })
  const reads = []
  const event = {
    target,
    defaultPrevented: false,
    clipboardData: {
      types: formats,
      files,
      getData(type) {
        reads.push(type)
        return read(type)
      },
    },
    preventDefault() { this.defaultPrevented = true },
    composedPath: () => [target],
  }
  const paste = () => handlers.get('paste')(event)
  return { controller, runtime, event, paste, reads, bookmark }
}

test('present but empty private clipboard MIME is a consumed rejection without text fallback', () => {
  const fixture = clipboardHarness({
    formats: [CLIPBOARD_FRAGMENT_MIME, 'text/plain'],
    read: type => type === 'text/plain' ? 'fallback' : '',
  })
  try {
    fixture.paste()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.deepEqual(fixture.reads, [CLIPBOARD_FRAGMENT_MIME])
  } finally { fixture.controller.destroy() }
})

test('private clipboard read errors consume the owned event rather than invoking native fallback', () => {
  const fixture = clipboardHarness({
    formats: [CLIPBOARD_FRAGMENT_MIME, 'text/plain'],
    read() { throw new Error('clipboard access denied') },
  })
  try {
    assert.doesNotThrow(() => fixture.paste())
    assert.equal(fixture.event.defaultPrevented, true)
    assert.deepEqual(fixture.reads, [CLIPBOARD_FRAGMENT_MIME])
  } finally { fixture.controller.destroy() }
})

for (const mode of ['non-boolean', 'throws']) {
  test(`invalid file paste matching (${mode}) cancels the event before resolver or fallback`, () => {
    let resolves = 0
    const fixture = clipboardHarness({
      formats: ['Files'],
      files: [{ name: 'file.txt' }],
      accepts(_input, insidePreparation) {
        assert.equal(insidePreparation(), true, 'accepts must run under the preparation guard')
        if (mode === 'throws') throw new Error('matching failed')
        return 'yes'
      },
      resolve() { resolves++; return new Promise(() => {}) },
    })
    try {
      assert.doesNotThrow(() => fixture.paste())
      assert.equal(fixture.event.defaultPrevented, true)
      assert.equal(resolves, 0)
    } finally { fixture.controller.destroy() }
  })
}

test('read-only task revocation rejects a pending resolver completion after editing is re-enabled', async () => {
  let complete
  let applied = 0
  const fixture = clipboardHarness({
    formats: ['Files'],
    files: [{ name: 'file.txt' }],
    accepts: () => true,
    resolve: () => new Promise(resolve => { complete = resolve }),
  })
  fixture.runtime.applyPasteResults = () => { applied++; return { blockId: 'a', inserted: [] } }
  try {
    fixture.paste()
    assert.equal(fixture.event.defaultPrevented, true)
    fixture.controller.cancelPendingTask()
    fixture.runtime.readOnly = true
    fixture.runtime.readOnly = false
    complete({ kind: 'block', data: { text: 'late' } })
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(applied, 0)
  } finally { fixture.controller.destroy() }
})

test('chosen resolver is captured once with its receiver before asynchronous work', async () => {
  let resolverReads = 0
  let resolutions = 0
  const capability = {
    accepts() { return true },
    get resolve() {
      resolverReads++
      if (resolverReads > 1) throw new Error('Late resolver property read')
      return function () {
        assert.equal(this, capability)
        resolutions++
        return Promise.resolve(null)
      }
    },
  }
  const fixture = clipboardHarness({
    formats: ['Files'],
    files: [{ name: 'file.txt' }],
    accepts: () => true,
    capability,
  })
  try {
    fixture.paste()
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.equal(resolverReads, 1)
    assert.equal(resolutions, 1)
  } finally { fixture.controller.destroy() }
})

test('valid asynchronous file resolution reaches one paste transaction', async () => {
  let applies = 0
  const fixture = clipboardHarness({
    formats: ['Files'],
    files: [{ name: 'file.txt' }],
    accepts: () => true,
    resolve: async () => ({ kind: 'rich-text', replacement: { kind: 'text', text: 'Content' } }),
  })
  fixture.runtime.applyPasteResults = (_blockId, _fieldKey, _range, entries) => {
    assert.equal(entries.length, 1)
    applies++
    return { blockId: 'a', inserted: [], focus: { fieldKey: 'text', offset: 7 } }
  }
  try {
    fixture.paste()
    for (let index = 0; index < 5; index++) await Promise.resolve()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.equal(applies, 1)
  } finally { fixture.controller.destroy() }
})

test('thenable paste matching cannot fall through to an asynchronous resolver', () => {
  let resolves = 0
  const fixture = clipboardHarness({
    formats: ['Files'],
    files: [{ name: 'file.txt' }],
    accepts: () => Promise.resolve(true),
    resolve() { resolves++; return null },
  })
  try {
    fixture.paste()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.equal(resolves, 0)
  } finally { fixture.controller.destroy() }
})

test('revoked asynchronous resolver cannot allocate IDs after a read-only round trip', () => {
  let context
  let issued = 0
  const fixture = clipboardHarness({
    formats: ['Files'],
    files: [{ name: 'file.txt' }],
    accepts: () => true,
    resolve(_input, provided) {
      context = provided
      return new Promise(() => {})
    },
  })
  fixture.runtime.createDataId = () => { issued++; return 'block-unexpected' }
  try {
    fixture.paste()
    assert.equal(typeof context?.createId, 'function')
    fixture.runtime.readOnly = true
    fixture.controller.cancelPendingTask()
    fixture.runtime.readOnly = false
    assert.throws(() => context.createId('block'), /no longer active/)
    assert.equal(issued, 0)
  } finally { fixture.controller.destroy() }
})

test('HTML with two paragraph roots replaces selected text before inserting later blocks', () => {
  const fixture = clipboardHarness({
    formats: ['text/html'],
    read: type => type === 'text/html' ? '<p>X</p><p>Y</p>' : '',
    accepts: () => false,
  })
  fixture.bookmark.anchor.offset = 3
  fixture.bookmark.focus.offset = 6
  const calls = []
  fixture.runtime.prepareHtmlImport = () => ({
    kind: 'blocks', leadingInlineHtml: 'X',
    blocks: [{ type: 'paragraph', data: { text: 'X' } }, { type: 'paragraph', data: { text: 'Y' } }],
  })
  fixture.runtime.insertLocalBlocks = () => { throw new Error('Legacy anchor-only path cannot own this selection') }
  fixture.runtime.insertClipboardParts = (id, field, range, parts) => {
    calls.push({ id, field, range, parts })
    return { blockId: 'after', inserted: ['after'], focus: { fieldKey: 'text', offset: 1 } }
  }
  try {
    fixture.paste()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.deepEqual(calls, [{
      id: 'a', field: 'text', range: { start: 3, end: 6 },
      parts: [{ kind: 'rich-text', html: 'X' }, { kind: 'local-block', type: 'paragraph', data: { text: 'Y' } }],
    }])
  } finally { fixture.controller.destroy() }
})

test('structural HTML without an inline root still forwards the selected range atomically', () => {
  const fixture = clipboardHarness({
    formats: ['text/html'],
    read: type => type === 'text/html' ? '<table><tr><td>Q</td></tr></table>' : '',
    accepts: () => false,
  })
  fixture.bookmark.anchor.offset = 1
  fixture.bookmark.focus.offset = 4
  const calls = []
  fixture.runtime.prepareHtmlImport = () => ({
    kind: 'blocks', blocks: [{ type: 'table', data: { rows: [{ id: 'r1', cells: [{ id: 'c1', text: 'Q' }] }] } }],
  })
  fixture.runtime.insertClipboardParts = (id, fieldKey, range, parts) => {
    calls.push({ id, fieldKey, range, parts })
    return { blockId: 'new-table', inserted: ['new-table'], focus: { fieldKey: 'text', offset: 0 } }
  }
  try {
    fixture.paste()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].range, { start: 1, end: 4 })
    assert.equal(calls[0].parts[0].kind, 'local-block')
    assert.equal(calls[0].parts[0].type, 'table')
  } finally { fixture.controller.destroy() }
})
