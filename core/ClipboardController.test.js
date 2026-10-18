import test from 'node:test'
import assert from 'node:assert/strict'

import { ClipboardController } from './ClipboardController.js'
import { CLIPBOARD_FRAGMENT_MIME } from './ClipboardFragment.js'

function clipboardHarness({ formats = [], read = () => '', files = [], accepts = null, resolve = null, capability = null, crossSelection = null, mode = 'rich-text', isComposing = () => false, auxiliaryControl = null, definitions = null } = {}) {
  const handlers = new Map()
  const host = { contains: () => true }
  const target = {
    closest(selector) {
      if(auxiliaryControl && selector.split(',').map(part=>part.trim()).includes(auxiliaryControl)) return this
      return selector === '[contenteditable="true"]' && accepts ? host : null
    },
  }
  const owner = accepts
    ? { blockId: 'a', fieldKey: 'text', mode, element: host }
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
  const registry = definitions ? {
    blockTypes: Object.keys(definitions),
    getBlockDefinition: type => definitions[type],
  } : {
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
  const view = { reconcileInteraction() {}, setCurrent() {}, focus() {} }
  const reconciler = {
    resolveEditableTarget: () => owner,
    getEditableFields: () => [{ key: 'text', mode: 'rich-text', element: {} }],
  }
  const controller = new ClipboardController({
    root,
    runtime,
    registry,
    reconciler,
    selection: { capture: () => bookmark },
    crossSelection,
    isComposing,
    view,
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
  const cut = () => handlers.get('cut')(event)
  const copy = () => handlers.get('copy')(event)
  return { controller, runtime, view, reconciler, event, paste, cut, copy, reads, bookmark }
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

test('structural HTML starts after the current block without deleting its selected text', () => {
  const fixture = clipboardHarness({
    formats: ['text/html'],
    read: type => type === 'text/html' ? '<table><tr><td>Q</td></tr></table>' : '',
    accepts: () => false,
  })
  fixture.bookmark.anchor.offset = 1
  fixture.bookmark.focus.offset = 4
  const calls = []
  const blocks = [{ type: 'table', data: { rows: [{ id: 'r1', cells: [{ id: 'c1', text: 'Q' }] }] } }]
  fixture.runtime.prepareHtmlImport = () => ({ kind: 'blocks', blocks })
  fixture.runtime.insertClipboardParts = () => {
    throw new Error('Structural first root must not replace an inline selection')
  }
  fixture.runtime.insertLocalBlocks = (anchorId, prepared, options) => {
    calls.push({ anchorId, prepared, options })
    return ['new-table']
  }
  try {
    fixture.paste()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.deepEqual(calls, [{
      anchorId: 'a', prepared: blocks,
      options: { replaceEmpty: false, name: 'clipboard.html-import' },
    }])
  } finally { fixture.controller.destroy() }
})

test('structural HTML with a collapsed caret can replace an empty placeholder', () => {
  const fixture = clipboardHarness({
    formats: ['text/html'],
    read: type => type === 'text/html' ? '<hr>' : '',
    accepts: () => false,
  })
  const calls = []
  fixture.runtime.prepareHtmlImport = () => ({
    kind: 'blocks', blocks: [{ type: 'delimiter', data: {} }],
  })
  fixture.runtime.insertLocalBlocks = (id, blocks, options) => {
    calls.push({ id, blocks, options })
    return ['new-delimiter']
  }
  fixture.runtime.insertClipboardParts = () => {
    throw new Error('A structural root must not use the logical text replacement route')
  }
  try {
    fixture.paste()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.deepEqual(calls, [{
      id: 'a', blocks: [{ type: 'delimiter', data: {} }],
      options: { replaceEmpty: true, name: 'clipboard.html-import' },
    }])
  } finally { fixture.controller.destroy() }
})

test('a paste task started during abort cannot be cleared by its predecessor', async () => {
  let attempts = 0
  let completeFresh
  let applied = 0
  let fixture
  fixture = clipboardHarness({
    formats: ['Files'],
    files: [{ name: 'reentrant.txt' }],
    accepts: () => true,
    resolve(_input, { signal }) {
      attempts++
      if (attempts === 1) {
        // A resolver can listen to abort and synchronously dispatch a new
        // user gesture before the old controller's cancellation returns.
        signal.addEventListener('abort', () => {
          fixture.event.defaultPrevented = false // model a distinct Paste event
          fixture.paste()
        }, { once: true })
        return new Promise(() => {})
      }
      return new Promise(resolve => { completeFresh = resolve })
    },
  })
  fixture.runtime.applyPasteResults = () => {
    applied++
    return { blockId: 'a', inserted: [], focus: { fieldKey: 'text', offset: 1 } }
  }

  try {
    fixture.paste()
    assert.equal(attempts, 1)
    fixture.controller.cancelPendingTask()
    assert.equal(attempts, 2, 'abort did not dispatch the succeeding Paste')
    completeFresh({ kind: 'rich-text', replacement: { kind: 'text', text: 'new' } })
    for (let index = 0; index < 8; index++) await Promise.resolve()
    assert.equal(applied, 1, 'stale cancellation cleared a newer Paste task')
  } finally { fixture.controller.destroy() }
})


test('failed rich-text Cut preparation cannot trigger native deletion', () => {
  const fixture = clipboardHarness({ accepts: () => false })
  fixture.bookmark.focus.offset = 3
  fixture.runtime.prepareLogicalClipboardSlice = () => {
    throw new Error('clipboard slice preparation failed')
  }
  try {
    assert.doesNotThrow(() => fixture.cut())
    assert.equal(fixture.event.defaultPrevented, true)
  } finally { fixture.controller.destroy() }
})

test('failed cross-block Cut preparation cannot trigger native deletion', () => {
  const crossSelection = {
    active: true,
    wholeBlockIds: ['a'],
    bookmark: { anchor: { blockId: 'a' }, focus: { blockId: 'a' } },
  }
  const fixture = clipboardHarness({ crossSelection })
  fixture.runtime.prepareLogicalClipboardSlice = () => {
    throw new Error('cross-block clipboard preparation failed')
  }
  try {
    assert.doesNotThrow(() => fixture.cut())
    assert.equal(fixture.event.defaultPrevented, true)
  } finally { fixture.controller.destroy() }
})

test('plain-text editing fields retain their native Cut behavior', () => {
  const fixture = clipboardHarness({ accepts: () => false, mode: 'plain-text' })
  fixture.bookmark.focus.offset = 3
  fixture.runtime.prepareLogicalClipboardSlice = () => {
    throw new Error('Plain text fields must not use the logical Cut planner')
  }
  try {
    assert.doesNotThrow(() => fixture.cut())
    assert.equal(fixture.event.defaultPrevented, false)
  } finally { fixture.controller.destroy() }
})

test('structured rich-text Cut is rejected during IME without reading canonical slices', () => {
  const fixture = clipboardHarness({ accepts: () => false, isComposing: () => true })
  fixture.bookmark.focus.offset = 3
  let plans = 0
  fixture.runtime.prepareLogicalClipboardSlice = () => { plans++ }
  try {
    fixture.cut()
    assert.equal(fixture.event.defaultPrevented, true,
      'native Cut could delete an unfinished IME preedit')
    assert.equal(plans, 0,
      'Cut tried to serialize a stale canonical range during composition')
    assert.deepEqual(fixture.reads, [])
  } finally { fixture.controller.destroy() }
})

test('cross-block Cut is rejected during IME without touching the document', () => {
  const crossSelection = {
    active: true,
    wholeBlockIds: ['a'],
    bookmark: { anchor: { blockId: 'a' }, focus: { blockId: 'a' } },
  }
  const fixture = clipboardHarness({ crossSelection, isComposing: () => true })
  let plans = 0
  fixture.runtime.prepareLogicalClipboardSlice = () => { plans++ }
  try {
    fixture.cut()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.equal(plans, 0,
      'cross-block Cut entered canonical slicing while composition was active')
  } finally { fixture.controller.destroy() }
})

test('plain-text auxiliary input retains native Cut during editor composition', () => {
  const fixture = clipboardHarness({
    accepts: () => false, mode: 'plain-text', isComposing: () => true,
  })
  let plans = 0
  fixture.runtime.prepareLogicalClipboardSlice = () => { plans++ }
  try {
    fixture.cut()
    assert.equal(fixture.event.defaultPrevented, false,
      'editor IME guard stole native Cut from a plain-text auxiliary control')
    assert.equal(plans, 0)
  } finally { fixture.controller.destroy() }
})

test('stale cross-block selection cannot steal native Cut from a plain-text input', () => {
  const crossSelection = {
    active: true,
    wholeBlockIds: ['a'],
    bookmark: { anchor: { blockId: 'a' }, focus: { blockId: 'a' } },
  }
  const fixture = clipboardHarness({
    accepts: () => false, mode: 'plain-text', crossSelection,
  })
  let plans = 0
  fixture.runtime.prepareLogicalClipboardSlice = () => { plans++ }
  try {
    fixture.cut()
    assert.equal(fixture.event.defaultPrevented, false,
      'stale cross-selection stole Cut from an auxiliary input')
    assert.equal(plans, 0)
  } finally { fixture.controller.destroy() }
})

test('stale cross-block selection cannot steal native Paste from a plain-text input', () => {
  const crossSelection = {
    active: true,
    wholeBlockIds: ['a'],
    bookmark: { anchor: { blockId: 'a' }, focus: { blockId: 'a' } },
  }
  const fixture = clipboardHarness({
    accepts: () => false,
    mode: 'plain-text',
    crossSelection,
    formats: [CLIPBOARD_FRAGMENT_MIME],
    read: () => '',
  })
  let plans = 0
  fixture.runtime.prepareLogicalClipboardSlice = () => { plans++ }
  try {
    fixture.paste()
    assert.equal(fixture.event.defaultPrevented, false,
      'stale cross-selection stole Paste from an auxiliary input')
    assert.equal(plans, 0)
  } finally { fixture.controller.destroy() }
})

test('a registered plain-text control retains native Copy despite a stale cross-selection', () => {
  const crossSelection={active:true,wholeBlockIds:['a'],bookmark:{anchor:{blockId:'a'},focus:{blockId:'a'}}}
  const h=clipboardHarness({accepts:()=>false,mode:'plain-text',crossSelection})
  let plans=0
  h.runtime.prepareLogicalClipboardSlice=()=>{plans++;return null}
  try{
    h.copy()
    assert.equal(h.event.defaultPrevented,false)
    assert.equal(plans,0,'Copy leaked cross-block canonical data from a plain-text editing field')
  }finally{h.controller.destroy()}
})

test('editor toolbar buttons and locked widgets do not steal native clipboard events', () => {
  const crossSelection={active:true,wholeBlockIds:['a'],bookmark:{anchor:{blockId:'a'},focus:{blockId:'a'}}}
  for(const auxiliaryControl of ['button','[contenteditable="false"]']){
    for(const operation of ['copy','cut','paste']){
      const h=clipboardHarness({
        crossSelection,auxiliaryControl,
        formats:[CLIPBOARD_FRAGMENT_MIME],
        read:()=>'{broken',
      })
      let plans=0
      h.runtime.prepareLogicalClipboardSlice=()=>{plans++;return null}
      try{
        h[operation]()
        assert.equal(h.event.defaultPrevented,false,
          auxiliaryControl+' '+operation+' was stolen by editor clipboard')
        assert.equal(plans,0,
          auxiliaryControl+' '+operation+' read a stale canonical selection')
        assert.deepEqual(h.reads,[],
          auxiliaryControl+' '+operation+' read private editor clipboard data')
      }finally{h.controller.destroy()}
    }
  }
})

test('rejected Paste candidate cannot rewrite the file seen by a later registered candidate', async () => {
  const observed = []
  const fixture = clipboardHarness({
    formats: ['Files'],
    files: [{ name: 'original.mp4', type: 'video/mp4' }],
    accepts: () => true,
    definitions: {
      paragraph: { capabilities: { paste: {
        accepts(input) {
          input.kind = 'text'
          input.file = { name: 'spoofed.mp4' }
          return false
        },
        resolve() { throw new Error('rejected Paste route resolved') },
      } } },
      video: { capabilities: { paste: {
        accepts(input) {
          observed.push(['matches', input.kind, input.file?.name])
          return input.kind === 'file' && input.file?.name === 'original.mp4'
        },
        resolve(input) {
          observed.push(['resolves', input.kind, input.file?.name])
          return null
        },
      } } },
    },
  })
  try {
    fixture.paste()
    for (let index = 0; index < 6; index++) await Promise.resolve()
    assert.equal(fixture.event.defaultPrevented, true)
    assert.deepEqual(observed, [
      ['matches', 'file', 'original.mp4'],
      ['resolves', 'file', 'original.mp4'],
    ])
  } finally { fixture.controller.destroy() }
})

test('accepted Paste matcher cannot rewrite its own later resolver input', async () => {
  let resolvedName
  const fixture = clipboardHarness({
    formats: ['Files'],
    files: [{ name: 'original.mp4', type: 'video/mp4' }],
    accepts: () => true,
    capability: {
      accepts(input) {
        input.file = { name: 'spoofed.mp4', type: 'video/mp4' }
        return true
      },
      resolve(input) {
        resolvedName = input.file.name
        return null
      },
    },
  })
  try {
    fixture.paste()
    for (let index = 0; index < 6; index++) await Promise.resolve()
    assert.equal(resolvedName, 'original.mp4')
  } finally { fixture.controller.destroy() }
})

test('a retired Clipboard paste listener cannot claim a later event after destruction', async () => {
  let resolutions = 0
  const fixture = clipboardHarness({
    formats: ['Files'],
    files: [{ name: 'retired.mp4', type: 'video/mp4' }],
    accepts: () => true,
    resolve() {
      resolutions++
      return { kind: 'block', data: { src: 'blob:should-not-allocate' } }
    },
  })
  fixture.controller.destroy()
  fixture.paste()
  for (let index = 0; index < 6; index++) await Promise.resolve()
  assert.equal(resolutions, 0, 'retired Clipboard listener executed a plugin resolver')
  assert.equal(fixture.event.defaultPrevented, false,
    'destroyed Clipboard controller claimed a new native paste event')
})


for (const [name, clipboardText] of [
  ['local text', 'Hello'],
  ['multiline text', 'Hello\nWorld'],
]) {
  test('committed ' + name + ' paste cannot read or reconcile destroyed editor UI', () => {
    const h = clipboardHarness({
      formats: ['text/plain'],
      read: type => type === 'text/plain' ? clipboardText : '',
      accepts: () => false,
    })
    let committed = 0
    let deadViewReads = 0
    let retired = false
    const failIfDead = () => {
      if (retired) {
        deadViewReads++
        throw new Error('committed paste touched detached editor UI')
      }
    }
    h.view.element = () => { failIfDead(); return null }
    h.view.reconcileInteraction = failIfDead
    h.view.setCurrent = failIfDead
    h.runtime.replaceLogicalRange = () => {
      committed++
      return { blockId: 'a', fieldKey: 'text', offset: 5 }
    }
    h.runtime.insertClipboardParts = () => {
      committed++
      return { blockId: 'a', focus: { fieldKey: 'text', offset: 5 } }
    }
    h.runtime.interact = (_name, operation, selectionAfter) => {
      const result = operation()
      selectionAfter?.(result)
      h.controller.destroy()
      retired = true
      return result
    }
    h.paste()
    assert.equal(h.event.defaultPrevented, true, 'committed paste fell through to native insertion')
    assert.equal(committed, 1, 'paste did not commit exactly once')
    assert.equal(deadViewReads, 0, 'paste retained presentation after owner destruction')
  })
}


for (const retirement of ['ownership lookup', 'second owner lookup', 'clipboard text getter', 'pending task cancellation']) {
  test('retired clipboard Paste cannot read or author after ' + retirement, () => {
    let fixture
    const h = clipboardHarness({
      formats: ['text/plain'],
      read(type) {
        if (type === 'text/plain' && retirement === 'clipboard text getter') fixture.controller.destroy()
        return type === 'text/plain' ? 'Hello' : ''
      },
      accepts: () => false,
    })
    fixture = h
    let attempts = 0
    h.runtime.replaceLogicalRange = () => {
      attempts++
      return { blockId: 'a', fieldKey: 'text', offset: 5 }
    }
    const resolve = h.reconciler.resolveEditableTarget.bind(h.reconciler)
    let reads = 0
    h.reconciler.resolveEditableTarget = target => {
      reads++
      if (retirement === 'ownership lookup' && reads === 1) h.controller.destroy()
      if (retirement === 'second owner lookup' && reads === 2) h.controller.destroy()
      return resolve(target)
    }
    if (retirement === 'pending task cancellation') {
      const cancel = h.controller.cancelPendingTask.bind(h.controller)
      let shouldDestroy = true
      h.controller.cancelPendingTask = () => {
        cancel()
        if (shouldDestroy) {
          shouldDestroy = false
          h.controller.destroy()
        }
      }
    }
    h.paste()
    assert.equal(attempts, 0, 'a revoked clipboard listener attempted a new canonical edit')
    assert.equal(h.event.defaultPrevented, false,
      'a clipboard listener that lost event ownership suppressed the native Paste')
    h.controller.destroy()
  })
}


test('whole-block Cut does not reconcile a view destroyed by its commit observer', () => {
  let active = true
  const crossSelection = {
    get active() { return active },
    wholeBlockIds: ['a'],
    bookmark: { anchor: { blockId: 'a', fieldKey: 'text', offset: 0 },
      focus: { blockId: 'a', fieldKey: 'text', offset: 1 } },
    clear() { active = false },
  }
  const h = clipboardHarness({ crossSelection, accepts: () => false })
  const clipboard = new Map()
  h.event.clipboardData.setData = (type, value) => clipboard.set(type, value)
  h.event.clipboardData.getData = type => clipboard.get(type) ?? ''
  h.reconciler.getElement = () => null
  h.runtime.prepareLogicalClipboardSlice = () => ({
    parts: [{ kind: 'block', block: { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'A' } } }],
  })
  let committed = 0
  let retired = false, staleViews = 0
  h.runtime.applyPreparedClipboardCut = () => {
    committed++
    return { blockId: 'a', focus: { fieldKey: 'text', offset: 0 } }
  }
  const readView = () => {
    if (retired) staleViews++
  }
  h.view.element = readView
  h.view.reconcileInteraction = readView
  h.view.setCurrent = readView
  h.runtime.interact = (_name, operation, selectionAfter) => {
    const result = operation()
    selectionAfter?.(result)
    h.controller.destroy()
    retired = true
    return result
  }
  h.cut()
  assert.equal(committed, 1, 'owned Cut did not persist exactly once')
  assert.equal(h.event.defaultPrevented, true, 'owned Cut fell back to native deletion')
  assert.equal(staleViews, 0, 'committed Cut reconciled a detached editor')
})


for (const action of ['copy', 'cut']) {
  test(action + ' cannot continue after ownership lookup destroys Clipboard controller', () => {
    const h = clipboardHarness({
      formats: ['text/plain'],
      accepts: () => false,
    })
    const resolve = h.reconciler.resolveEditableTarget.bind(h.reconciler)
    let reads = 0
    h.reconciler.resolveEditableTarget = target => {
      reads++
      if (reads === 1) h.controller.destroy()
      return resolve(target)
    }
    h[action]()
    assert.equal(reads, 1, 'retired ' + action + ' continued resolving detached editing owners')
    assert.equal(h.event.defaultPrevented, false,
      'retired ' + action + ' consumed a native clipboard event')
  })
}


test('read-only Copy still exports an owned whole-block clipboard fragment', () => {
  const crossSelection = {
    active: true,
    wholeBlockIds: ['a'],
    bookmark: { anchor: { blockId: 'a', fieldKey: 'text', offset: 0 },
      focus: { blockId: 'a', fieldKey: 'text', offset: 1 } },
  }
  const h = clipboardHarness({ crossSelection, accepts: () => false })
  h.runtime.readOnly = true
  h.reconciler.getElement = () => null
  h.runtime.prepareLogicalClipboardSlice = () => ({
    parts: [{ kind: 'block', block: {
      id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'A' },
    } }],
  })
  const clipboard = new Map()
  h.event.clipboardData.setData = (kind, value) => clipboard.set(kind, value)
  h.event.clipboardData.getData = kind => clipboard.get(kind) ?? ''
  h.copy()
  assert.equal(h.event.defaultPrevented, true,
    'read-only Copy lost its canonical fragment ownership')
  assert.equal(clipboard.has(CLIPBOARD_FRAGMENT_MIME), true,
    'read-only Copy did not publish the structured fragment')
  h.controller.destroy()
})

test('clipboard data writer teardown cancels an uncommitted Cut before model mutation', () => {
  let active = true
  const crossSelection = {
    get active() { return active },
    wholeBlockIds: ['a'],
    bookmark: { anchor: { blockId: 'a', fieldKey: 'text', offset: 0 },
      focus: { blockId: 'a', fieldKey: 'text', offset: 1 } },
    clear() { active = false },
  }
  const h = clipboardHarness({ crossSelection, accepts: () => false })
  h.reconciler.getElement = () => null
  h.runtime.prepareLogicalClipboardSlice = () => ({
    parts: [{ kind: 'block', block: {
      id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'A' },
    } }],
  })
  let commits = 0
  h.runtime.applyPreparedClipboardCut = () => { commits++; return { blockId: 'a' } }
  const clipboard = new Map()
  h.event.clipboardData.setData = (kind, value) => {
    clipboard.set(kind, value)
    if (kind === 'text/plain') h.controller.destroy()
  }
  h.event.clipboardData.getData = kind => clipboard.get(kind) ?? ''
  h.cut()
  assert.equal(commits, 0, 'Cut attempted a canonical edit after clipboard writer retired the editor')
  assert.equal(active, true, 'retired Cut cleared author selection')
})


test('cross-block plain-text Paste preserves a committed transaction but skips detached presentation', () => {
  let selected = true, cleared = 0, committed = 0, detachedReads = 0
  const crossSelection = {
    get active() { return selected },
    bookmark: { anchor: { blockId: 'a', fieldKey: 'text', offset: 0 },
      focus: { blockId: 'a', fieldKey: 'text', offset: 1 } },
    wholeBlockIds: [],
    clear() { cleared++; selected = false },
  }
  const h = clipboardHarness({
    crossSelection,
    formats: ['text/plain'],
    read: type => type === 'text/plain' ? 'Alpha' : '',
    accepts: () => false,
  })
  h.runtime.prepareLogicalClipboardSlice = () => ({ focus: { blockId: 'a' } })
  h.runtime.replacePreparedClipboardSlice = (_plan, parts) => {
    committed++
    assert.deepEqual(parts, [{ kind: 'rich-text', html: 'Alpha' }])
    return { blockId: 'a', focus: { fieldKey: 'text', offset: 5 } }
  }
  let retired = false
  const afterDeath = () => { if (retired) detachedReads++ }
  h.view.element = afterDeath
  h.view.reconcileInteraction = afterDeath
  h.view.setCurrent = afterDeath
  h.runtime.interact = (_name, operation, selectionAfter) => {
    const result = operation()
    selectionAfter?.(result)
    h.controller.destroy()
    retired = true
    return result
  }
  h.paste()
  assert.equal(h.event.defaultPrevented, true, 'owned composite Paste fell through to native editing')
  assert.equal(committed, 1, 'composite Paste did not commit once')
  assert.equal(detachedReads, 0, 'composite Paste touched detached view after commit')
  assert.equal(cleared, 0, 'retired composite Paste attempted UI selection cleanup')
})

test('cross-block clipboard read that destroys editor cannot subsequently author Paste', () => {
  let h, committed = 0
  const crossSelection = {
    active: true,
    bookmark: { anchor: { blockId: 'a', fieldKey: 'text', offset: 0 },
      focus: { blockId: 'a', fieldKey: 'text', offset: 1 } },
    wholeBlockIds: [],
    clear() { throw Error('retired Paste cleared selected blocks') },
  }
  h = clipboardHarness({
    crossSelection,
    formats: ['text/plain'],
    accepts: () => false,
    read(type) {
      if (type === 'text/plain') h.controller.destroy()
      return type === 'text/plain' ? 'Alpha' : ''
    },
  })
  h.runtime.prepareLogicalClipboardSlice = () => {
    committed++
    throw Error('retired Paste prepared canonical slices')
  }
  h.paste()
  assert.equal(committed, 0, 'clipboard callback revoked ownership before preparation')
  assert.equal(h.event.defaultPrevented, false, 'retired clipboard handler claimed the old Paste event')
})
