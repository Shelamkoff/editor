import test from 'node:test'
import assert from 'node:assert/strict'

import { ClipboardController } from './ClipboardController.js'

function fixture({ resolve, apply, createObjectURL, reconcile, revokeFailure = null, onRevoke = null, diagnostics = null, capture = null, AbortControllerCtor = AbortController } = {}) {
  const events = new Map()
  const created = [], revoked = [], applied = []
  const URLCtor = {
    createObjectURL(file) {
      const url = createObjectURL
        ? createObjectURL(file)
        : 'blob:clipboard-owned-' + (created.length + 1)
      created.push(url)
      return url
    },
    revokeObjectURL(url) {
      revoked.push(url)
      onRevoke?.(url)
      if (revokeFailure?.(url)) throw new Error('revoke failed')
    },
  }
  const host = { contains: () => true }
  const target = {
    closest(selector) {
      return selector === '[contenteditable="true"]' ? host : null
    },
  }
  const root = {
    ownerDocument: { defaultView: { AbortController: AbortControllerCtor, URL: URLCtor } },
    contains: () => true,
    addEventListener(type, callback) { events.set(type, callback) },
  }
  const owner = { blockId: 'a', fieldKey: 'text', mode: 'rich-text', element: host }
  const bookmark = {
    anchor: { blockId: 'a', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'a', fieldKey: 'text', offset: 0 },
  }
  const runtime = {
    readOnly: false,
    generation: 1,
    revision: 0,
    modeEpoch: 0,
    has: id => id === 'a',
    get: id => id === 'a' ? { id: 'a', type: 'video' } : null,
    createDataId: prefix => prefix + '-1',
    prepareExtensionValue: action => action(),
    interact(_name, action, selectionAfter) {
      const result = action()
      selectionAfter?.(result)
      return result
    },
    applyPasteResults(...args) {
      applied.push(args)
      if (apply) return apply(args, runtime)
      runtime.revision++
      return { blockId: 'a', inserted: ['video-1'] }
    },
  }
  const plugin = {
    capabilities: {
      paste: {
        accepts: input => input.kind === 'file',
        resolve: resolve ?? ((_input, context) => ({
          kind: 'block',
          data: { src: context.createObjectURL({ name: 'sample.mp4' }) },
        })),
      },
    },
  }
  const controller = new ClipboardController({
    root, runtime, diagnostics,
    registry: { blockTypes: ['video'], getBlockDefinition: () => plugin },
    reconciler: {
      resolveEditableTarget: () => owner,
      getEditableFields: () => [{ key: 'text', mode: 'rich-text', element: {} }],
    },
    selection: { capture: () => typeof capture === 'function' ? capture(bookmark) : bookmark },
    view: {
      currentId: 'a',
      reconcileInteraction() { reconcile?.() }, setCurrent() {}, focus() {},
    },
  })
  const paste = () => {
    const event = {
      target,
      clipboardData: {
        types: ['Files'], files: [{ name: 'sample.mp4', type: 'video/mp4' }],
        getData: () => '',
      },
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      composedPath: () => [target],
    }
    events.get('paste')(event)
    return event
  }
  const settle = async () => {
    for (let index = 0; index < 12; index++) await Promise.resolve()
  }
  return { controller, runtime, URLCtor, created, revoked, applied, paste, settle }
}

test('a successful blob-backed Paste remains readable across Undo until editor disposal', async () => {
  const f = fixture()
  try {
    assert.equal(f.paste().defaultPrevented, true)
    await f.settle()
    assert.equal(f.applied.length, 1)
    assert.deepEqual(f.created, ['blob:clipboard-owned-1'])
    assert.deepEqual(f.revoked, [], 'successful media was revoked before history could redo it')
    f.controller.handleTransaction({ origin: 'history', name: 'history.undo' })
    assert.deepEqual(f.revoked, [], 'Undo cannot destroy media retained by Redo')
  } finally { f.controller.destroy() }
  assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'])
})

test('canceling a pending Paste promptly revokes uncommitted media even if resolver ignores abort', async () => {
  let finish
  const f = fixture({
    resolve: async (_input, context) => {
      const src = context.createObjectURL({ name: 'sample.mp4' })
      await new Promise(resolve => { finish = resolve })
      return { kind: 'block', data: { src } }
    },
  })
  try {
    assert.equal(f.paste().defaultPrevented, true)
    assert.equal(f.created.length, 1)
    f.controller.cancelPendingTask()
    assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'])
    finish()
    await f.settle()
    assert.equal(f.applied.length, 0)
  } finally { f.controller.destroy() }
  assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'], 'late completion double-revoked the URL')
})

test('rejected Paste commit revokes every newly created blob resource', async () => {
  const f = fixture({ apply: () => { throw new Error('projection rejected') } })
  try {
    f.paste()
    await f.settle()
    assert.equal(f.applied.length, 1)
    assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'])
  } finally { f.controller.destroy() }
  assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'])
})

test('no-op Paste does not retain a blob URL with no canonical document reference', async () => {
  const f = fixture({ apply: () => ({ blockId: 'a', inserted: [] }) })
  try {
    f.paste()
    await f.settle()
    assert.equal(f.runtime.revision, 0)
    assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'])
  } finally { f.controller.destroy() }
})

test('reentrant editor destruction during object-URL creation immediately revokes the orphan', async () => {
  let destroy
  const f = fixture({
    createObjectURL: () => {
      destroy()
      return 'blob:reentrant-destroy'
    },
  })
  destroy = () => f.controller.destroy()
  f.paste()
  await f.settle()
  assert.deepEqual(f.revoked, ['blob:reentrant-destroy'])
  assert.equal(f.applied.length, 0)
})

test('an accepted video Paste keeps its blob when a post-commit view observer fails', async () => {
  const f = fixture({ reconcile: () => { throw new Error('presentation observer failed') } })
  try {
    f.paste()
    await f.settle()
    assert.equal(f.runtime.revision, 1, 'canonical media was never committed')
    assert.deepEqual(f.revoked, [], 'observer failure destroyed media referenced by canonical history')
  } finally { f.controller.destroy() }
  assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'])
})

test('a Paste resolver that declines after allocating a temporary URL releases it', async () => {
  const f = fixture({
    resolve: (_input, context) => {
      context.createObjectURL({ name: 'ignored.mp4' })
      return null
    },
  })
  try {
    f.paste()
    await f.settle()
    assert.equal(f.applied.length, 0)
    assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'])
  } finally { f.controller.destroy() }
  assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'])
})

test('anchor edit promptly revokes stale pending media while its resolver is still awaiting', async () => {
  let finish
  const f = fixture({
    resolve: async (_input, context) => {
      const url = context.createObjectURL({ name: 'pending.mp4' })
      await new Promise(resolve => { finish = resolve })
      return { kind: 'block', data: { src: url } }
    },
  })
  try {
    f.paste()
    assert.deepEqual(f.created, ['blob:clipboard-owned-1'])
    f.runtime.revision++
    f.controller.handleTransaction({
      origin: 'external', name: 'block.update',
      changes: [{ kind: 'block.update', id: 'a' }],
    })
    assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'],
      'stale Paste retained media until a noncooperative resolver finished')
    finish()
    await f.settle()
    assert.equal(f.applied.length, 0)
  } finally { f.controller.destroy() }
})

test('unrelated committed edit also retires pending Paste since its revision lease is stale', async () => {
  let finish
  const f = fixture({
    resolve: async (_input, context) => {
      const url = context.createObjectURL({ name: 'pending.mp4' })
      await new Promise(resolve => { finish = resolve })
      return { kind: 'block', data: { src: url } }
    },
  })
  try {
    f.paste()
    f.runtime.revision++
    f.controller.handleTransaction({
      origin: 'external', name: 'block.update',
      changes: [{ kind: 'block.update', id: 'another-block' }],
    })
    assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'],
      'any later document commit invalidates a Paste with captured revision')
    finish()
    await f.settle()
    assert.equal(f.applied.length, 0)
  } finally { f.controller.destroy() }
})

test('an asynchronous Paste commit must not cancel and revoke its own media lease', async () => {
  let f
  f = fixture({
    apply(_args, runtime) {
      runtime.revision++
      f.controller.handleTransaction({
        origin: 'user', name: 'clipboard.paste',
        changes: [{ kind: 'block.insert', block: { id: 'video-1' } }],
      })
      return { blockId: 'a', inserted: ['video-1'] }
    },
  })
  try {
    f.paste()
    await f.settle()
    assert.equal(f.applied.length, 1)
    assert.deepEqual(f.revoked, [],
      'Paste was revoked by the transaction event generated by its own commit')
  } finally { f.controller.destroy() }
  assert.deepEqual(f.revoked, ['blob:clipboard-owned-1'])
})

test('editor disposal releases all owned blobs even if one revoke and diagnostics both throw', async () => {
  const f = fixture({
    resolve: (_input, context) => ({
      kind: 'block', data: {
        first: context.createObjectURL({ name: 'first.mp4' }),
        second: context.createObjectURL({ name: 'second.mp4' }),
      },
    }),
    revokeFailure: url => url.endsWith('-1'),
    diagnostics: {
      now: () => 0, threshold: () => Infinity,
      emit() { throw new Error('diagnostic transport failed') },
      errorName: () => 'Error',
    },
  })
  f.paste()
  await f.settle()
  assert.deepEqual(f.created, ['blob:clipboard-owned-1', 'blob:clipboard-owned-2'])
  assert.deepEqual(f.revoked, [])
  assert.doesNotThrow(() => f.controller.destroy(),
    'an observer failure interrupted ownership release during editor destruction')
  assert.deepEqual(f.revoked, f.created, 'later video URLs leaked when the first revoke failed')
})

test('canceling media Paste releases remaining pending resources when diagnostics fails', async () => {
  let complete
  const f = fixture({
    resolve: async (_input, context) => {
      const first = context.createObjectURL({ name: 'first.mp4' })
      const second = context.createObjectURL({ name: 'second.mp4' })
      await new Promise(resolve => { complete = resolve })
      return { kind: 'block', data: { first, second } }
    },
    revokeFailure: url => url.endsWith('-1'),
    diagnostics: {
      now: () => 0, threshold: () => Infinity,
      emit() { throw new Error('diagnostic transport failed') },
      errorName: () => 'Error',
    },
  })
  try {
    f.paste()
    assert.doesNotThrow(() => f.controller.cancelPendingTask(),
      'abort propagated a diagnostic error instead of retiring all resources')
    assert.deepEqual(f.revoked, f.created,
      'the second uncommitted URL survived a prior revocation/reporting failure')
    complete()
    await f.settle()
    assert.equal(f.applied.length, 0)
  } finally { f.controller.destroy() }
})

test('reentrant editor destruction cannot revoke a committed media URL twice', async () => {
  let f
  let onRevokeCalls = 0
  f = fixture({
    resolve: (_input, context) => ({
      kind: 'block',
      data: {
        first: context.createObjectURL({ name: 'one.mp4' }),
        second: context.createObjectURL({ name: 'two.mp4' }),
      },
    }),
    onRevoke() {
      if (++onRevokeCalls === 1) f.controller.destroy()
    },
  })
  f.paste()
  await f.settle()
  assert.deepEqual(f.created, ['blob:clipboard-owned-1', 'blob:clipboard-owned-2'])
  f.controller.destroy()
  assert.deepEqual(f.revoked, f.created,
    'reentrant destroy revoked a lease more than once')
  f.controller.destroy()
  assert.deepEqual(f.revoked, f.created,
    'idempotent destroy revoked a lease a second time')
})

test('reentrant newer Paste cannot revoke blob media already committed by the first Paste', async () => {
  let fixtureInstance
  let resolves = 0
  let settleNext
  fixtureInstance = fixture({
    resolve(_input, context) {
      if (++resolves === 1) {
        return { kind: 'block', data: {
          src: context.createObjectURL({ name: 'video.mp4' }),
        } }
      }
      return new Promise(resolve => { settleNext = resolve })
    },
    apply(_args, runtime) {
      runtime.revision++
      if (resolves === 1) {
        // A user callback can start a new Paste during the commit's
        // synchronous publication, before the old operation unwinds.
        fixtureInstance.paste()
      }
      return { blockId: 'a', inserted: ['video-1'] }
    },
  })
  try {
    fixtureInstance.paste()
    await fixtureInstance.settle()
    assert.equal(fixtureInstance.applied.length, 1)
    assert.deepEqual(fixtureInstance.created, ['blob:clipboard-owned-1'])
    assert.deepEqual(fixtureInstance.revoked, [],
      'reentrant Paste revoked media referenced by a committed author document')
    fixtureInstance.controller.cancelPendingTask()
    settleNext(null)
    await fixtureInstance.settle()
    assert.deepEqual(fixtureInstance.revoked, [])
  } finally { fixtureInstance.controller.destroy() }
  assert.deepEqual(fixtureInstance.revoked, fixtureInstance.created)
})

test('reentrant editor destruction during a successful Paste commit releases blob once', async () => {
  let fixtureInstance
  fixtureInstance = fixture({
    apply(_args, runtime) {
      runtime.revision++
      fixtureInstance.controller.destroy()
      return { blockId: 'a', inserted: ['video-1'] }
    },
  })
  fixtureInstance.paste()
  await fixtureInstance.settle()
  assert.equal(fixtureInstance.runtime.revision, 1)
  assert.deepEqual(fixtureInstance.revoked, ['blob:clipboard-owned-1'])
  fixtureInstance.controller.destroy()
  assert.deepEqual(fixtureInstance.revoked, ['blob:clipboard-owned-1'])
})

test('abort during a rejected canonical Paste releases the blob after rollback', async () => {
  let fixtureInstance
  fixtureInstance = fixture({
    apply() {
      // Cancellation arrives while the prepared author edit is still
      // executing, but no canonical commit will take ownership.
      fixtureInstance.controller.cancelPendingTask()
      throw new Error('projection rejected')
    },
  })
  try {
    fixtureInstance.paste()
    await fixtureInstance.settle()
    assert.equal(fixtureInstance.runtime.revision, 0)
    assert.deepEqual(fixtureInstance.revoked, fixtureInstance.created,
      'deferred revocation leaked a blob after the canceled transaction rolled back')
  } finally { fixtureInstance.controller.destroy() }
  assert.deepEqual(fixtureInstance.revoked, fixtureInstance.created)
})
test('Paste diagnostic clock failure does not prevent an owned asynchronous file insertion', async () => {
  const f = fixture({
    diagnostics: {
      now() { throw new Error('telemetry clock unavailable') },
      threshold() { return 0 },
      emit() {},
      errorName(error) { return error?.name ?? 'UnknownError' },
    },
  })
  try {
    assert.doesNotThrow(() => f.paste(), 'telemetry stopped native Paste before file resolution')
    await f.settle()
    assert.equal(f.applied.length, 1)
    assert.equal(f.created.length, 1)
  } finally { f.controller.destroy() }
})

test('Paste telemetry failure cannot interrupt a completed asynchronous Paste', async () => {
  let tick = 0
  const f = fixture({
    diagnostics: {
      now() { return ++tick },
      threshold() { throw new Error('broken telemetry threshold') },
      emit() { throw new Error('broken telemetry emission') },
      errorName(error) { return error?.name ?? 'UnknownError' },
    },
  })
  try {
    assert.equal(f.paste().defaultPrevented, true)
    await f.settle()
    assert.equal(f.applied.length, 1)
    assert.deepEqual(f.revoked, [], 'successful async Paste lost its persisted media lease')
    // A second Paste must remain possible after the previous task's finally.
    assert.equal(f.paste().defaultPrevented, true)
    await f.settle()
    assert.equal(f.applied.length, 2)
  } finally { f.controller.destroy() }
  assert.deepEqual(f.revoked, f.created, 'all retained media URLs must release on destroy')
})

test('Paste resolver rejection with throwing diagnostics is contained and a later Paste still works', async () => {
  let resolves = 0
  const f = fixture({
    resolve: (_input, context) => {
      if (++resolves === 1) throw new Error('resolver rejected')
      return { kind: 'block', data: { src: context.createObjectURL({ name: 'sample.mp4' }) } }
    },
    diagnostics: {
      now() { return 1 },
      threshold() { return Infinity },
      emit() { throw new Error('diagnostics transport unavailable') },
      errorName() { return 'Error' },
    },
  })
  try {
    f.paste()
    await f.settle()
    assert.equal(f.applied.length, 0)
    f.paste()
    await f.settle()
    assert.equal(f.applied.length, 1)
  } finally { f.controller.destroy() }
})
test('Paste diagnostic hooks cannot author another insertion before routing', async () => {
  let runtime
  let inObservation = false
  let attempts = 0
  let denied = 0
  let clock = 0
  const diagnostics = {
    now() {
      if (runtime) {
        attempts++
        try { runtime.applyPasteResults() }
        catch (error) {
          if (/diagnostic observation/.test(String(error))) denied++
          else throw error
        }
      }
      return ++clock
    },
    threshold() { return Infinity },
    emit() {},
    errorName(error) { return error?.name ?? 'UnknownError' },
  }
  const f = fixture({ diagnostics })
  runtime = f.runtime
  const originalApply = runtime.applyPasteResults.bind(runtime)
  runtime.applyPasteResults = (...args) => {
    if (inObservation) throw new Error('Cannot persist during diagnostic observation')
    return originalApply(...args)
  }
  runtime.observeExtension = operation => {
    inObservation = true
    try { return operation() }
    finally { inObservation = false }
  }
  try {
    f.paste()
    await f.settle()
    assert.ok(attempts >= 2, 'both the ingress and async Paste clocks ran')
    assert.equal(denied, attempts, 'every diagnostic mutation was denied')
    assert.equal(f.applied.length, 1, 'only the authorized Paste committed')
  } finally { f.controller.destroy() }
})
test('asynchronous Paste reports valid zero-origin timing without leaking resources', async () => {
  const events = []
  let calls = 0
  const f = fixture({
    diagnostics: {
      now() { return calls++ < 2 ? 0 : 5 },
      threshold(name) { return name === 'pasteMs' ? 0 : Infinity },
      emit(code, metadata) { events.push({ code, ...metadata }) },
      errorName(error) { return error?.name ?? 'UnknownError' },
    },
  })
  try {
    f.paste()
    await f.settle()
    assert.equal(f.applied.length, 1)
    assert.equal(events.filter(event => event.code === 'paste.slow').length, 1)
    assert.equal(events.find(event => event.code === 'paste.slow').durationMs, 5)
  } finally { f.controller.destroy() }
  assert.deepEqual(f.revoked, f.created)
})

test('async Paste preflight selection throw retires the half-open task lease', async () => {
  const controllers = []
  class TrackedAbortController extends AbortController {
    constructor() {
      super()
      controllers.push(this)
    }
  }
  let captures = 0
  const diagnosticEvents = []
  const f = fixture({
    AbortControllerCtor: TrackedAbortController,
    capture(bookmark) {
      if (++captures === 2) throw new Error('staging native selection unavailable')
      return bookmark
    },
    diagnostics: {
      now: () => 1,
      threshold: () => Infinity,
      emit(code, details) { diagnosticEvents.push({ code, ...details }) },
      errorName: error => error?.name ?? 'UnknownError',
    },
  })
  try {
    const first = f.paste()
    assert.equal(first.defaultPrevented, true)
    assert.equal(controllers.length, 2, 'one lifetime controller and one staged task')
    assert.equal(controllers[1].signal.aborted, true,
      'selection failure left a live task registered without a finalizer')
    assert.equal(f.applied.length, 0)
    assert.equal(f.created.length, 0)
    assert.ok(diagnosticEvents.some(event => event.code === 'paste.failed'))
    f.paste()
    await f.settle()
    assert.equal(f.applied.length, 1, 'new author Paste could not replace failed staging')
  } finally { f.controller.destroy() }
})

test('async Paste final selection recheck failure releases blob and reports without rejection', async () => {
  let captures = 0
  const diagnosticEvents = []
  const f = fixture({
    capture(bookmark) {
      if (++captures === 3) throw new Error('native selection became unavailable')
      return bookmark
    },
    diagnostics: {
      now: () => 1,
      threshold: () => Infinity,
      emit(code, details) { diagnosticEvents.push({ code, ...details }) },
      errorName: error => error?.name ?? 'UnknownError',
    },
  })
  try {
    assert.equal(f.paste().defaultPrevented, true)
    await f.settle()
    assert.equal(f.applied.length, 0, 'failed selection recheck committed stale Paste')
    assert.deepEqual(f.revoked, f.created, 'Paste blob URL survived failed final preflight')
    assert.ok(diagnosticEvents.some(event =>
      event.code === 'paste.failed' && event.operation === 'clipboard.paste-task' &&
      event.errorName === 'Error'),
    'unhandled selection failure was not routed through async Paste diagnostics')
    assert.equal(f.paste().defaultPrevented, true)
    await f.settle()
    assert.equal(f.applied.length, 1, 'a later owned Paste remained blocked by rejected task')
  } finally { f.controller.destroy() }
  assert.deepEqual(f.revoked, f.created)
})
