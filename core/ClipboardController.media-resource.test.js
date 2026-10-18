import test from 'node:test'
import assert from 'node:assert/strict'

import { ClipboardController } from './ClipboardController.js'

function fixture({ resolve, apply, createObjectURL, reconcile } = {}) {
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
    revokeObjectURL(url) { revoked.push(url) },
  }
  const host = { contains: () => true }
  const target = {
    closest(selector) {
      return selector === '[contenteditable="true"]' ? host : null
    },
  }
  const root = {
    ownerDocument: { defaultView: { AbortController, URL: URLCtor } },
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
    root, runtime,
    registry: { blockTypes: ['video'], getBlockDefinition: () => plugin },
    reconciler: {
      resolveEditableTarget: () => owner,
      getEditableFields: () => [{ key: 'text', mode: 'rich-text', element: {} }],
    },
    selection: { capture: () => bookmark },
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
