// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { mountGalleryMasonry } from './galleryMasonry.js'

test('gallery masonry waits and cleans up through the container owning window', async () => {
  const calls = []
  class OwnerResizeObserver {
    constructor(callback) { this.callback = callback; calls.push('observer:new') }
    observe(target) { calls.push(['observe', target]) }
    disconnect() { calls.push('observer:disconnect') }
  }
  const ownerView = {
    ResizeObserver: OwnerResizeObserver,
    requestAnimationFrame(callback) { calls.push(['raf', callback]); return 17 },
    cancelAnimationFrame(id) { calls.push(['cancel', id]) },
    getComputedStyle() { calls.push('style'); return { columnGap: '8px', gap: '8px' } },
    queueMicrotask(callback) { calls.push(['microtask', callback]) },
  }
  const container = {
    ownerDocument: { defaultView: ownerView },
    isConnected: false,
    getBoundingClientRect() { return { width: 0 } },
    classList: { add() {} },
  }

  const previousResizeObserver = globalThis.ResizeObserver
  const previousRaf = globalThis.requestAnimationFrame
  const previousCancelRaf = globalThis.cancelAnimationFrame
  const previousGetComputedStyle = globalThis.getComputedStyle
  globalThis.ResizeObserver = class { constructor() { throw new Error('ambient ResizeObserver must not be used') } }
  globalThis.requestAnimationFrame = () => { throw new Error('ambient rAF must not be used') }
  globalThis.cancelAnimationFrame = () => { throw new Error('ambient cancelAnimationFrame must not be used') }
  globalThis.getComputedStyle = () => { throw new Error('ambient getComputedStyle must not be used') }
  try {
    const mount = mountGalleryMasonry(container, [])
    mount.destroy()
    assert.equal(await mount.ready, null)
  } finally {
    globalThis.ResizeObserver = previousResizeObserver
    globalThis.requestAnimationFrame = previousRaf
    globalThis.cancelAnimationFrame = previousCancelRaf
    globalThis.getComputedStyle = previousGetComputedStyle
  }

  assert.equal(calls[0], 'observer:new')
  assert.deepEqual(calls[1], ['observe', container])
  assert.equal(calls[2][0], 'raf')
  assert.equal(calls[3][0], 'microtask')
  assert.equal(calls.includes('observer:disconnect'), true)
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'cancel' && call[1] === 17), true)
})


test('gallery masonry settles even when its error observer throws or rejects', async () => {
  const microtasks = []
  const ownerView = {
    queueMicrotask(callback) { microtasks.push(callback) },
    getComputedStyle() { throw new Error('layout read failed') },
  }
  const container = {
    ownerDocument: { defaultView: ownerView },
    isConnected: true,
    getBoundingClientRect() { return { width: 320 } },
    classList: { add() {} },
  }

  let calls = 0
  const mount = mountGalleryMasonry(container, [], {
    async onError() {
      calls++
      throw new Error('observer failed')
    },
  })
  assert.equal(microtasks.length, 1)
  microtasks[0]()
  assert.equal(await mount.ready, null)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(calls, 1)
  mount.destroy()
})


test('gallery masonry abort during observer disconnect does not start revoked layout or disconnect twice', async () => {
  const controller = new AbortController()
  const microtasks = []
  let disconnects = 0
  let styleReads = 0
  let frameCancels = 0
  class OwnerResizeObserver {
    observe() {}
    disconnect() {
      disconnects++
      controller.abort()
    }
  }
  const ownerView = {
    ResizeObserver: OwnerResizeObserver,
    queueMicrotask(callback) { microtasks.push(callback) },
    requestAnimationFrame() { return 23 },
    cancelAnimationFrame() { frameCancels++ },
    getComputedStyle() {
      styleReads++
      return { columnGap: '8px' }
    },
  }
  const container = {
    ownerDocument: { defaultView: ownerView },
    isConnected: true,
    getBoundingClientRect() { return { width: 350 } },
    classList: { add() {} },
  }
  const mount = mountGalleryMasonry(container, [], { signal: controller.signal })
  assert.equal(microtasks.length, 1)
  microtasks[0]()
  assert.equal(await mount.ready, null)
  for (let i = 0; i < 4; i++) await Promise.resolve()
  assert.equal(controller.signal.aborted, true)
  assert.equal(disconnects, 1, 'a reentrant abort disconnected the same observer twice')
  assert.equal(frameCancels, 1)
  assert.equal(styleReads, 0, 'a retired gallery started a new layout after abort')
  assert.equal(mount.instance, null)
})

test('gallery masonry abort during geometry observation cannot start a revoked instance', async () => {
  const controller = new AbortController()
  const microtasks = []
  let styles = 0
  const container = {
    ownerDocument: { defaultView: {
      queueMicrotask(callback) { microtasks.push(callback) },
      getComputedStyle() {
        styles++
        return { columnGap: '4px' }
      },
    } },
    isConnected: true,
    getBoundingClientRect() {
      controller.abort()
      return { width: 360 }
    },
    classList: { add() {} },
  }
  const mount = mountGalleryMasonry(container, [], { signal: controller.signal })
  microtasks[0]()
  assert.equal(await mount.ready, null)
  assert.equal(styles, 0, 'layout styles accessed after cancellation during geometry read')
  assert.equal(mount.instance, null)
})

test('gallery masonry abort during observer registration skips later scheduled work', async () => {
  const controller = new AbortController()
  let frames = 0
  let microtasks = 0
  let disconnects = 0
  class OwnerResizeObserver {
    observe() { controller.abort() }
    disconnect() { disconnects++ }
  }
  const container = {
    ownerDocument: { defaultView: {
      ResizeObserver: OwnerResizeObserver,
      requestAnimationFrame() { frames++; return 1 },
      cancelAnimationFrame() {},
      queueMicrotask() { microtasks++ },
    } },
    isConnected: false,
    getBoundingClientRect() { return { width: 0 } },
    classList: { add() {} },
  }
  const mount = mountGalleryMasonry(container, [], { signal: controller.signal })
  assert.equal(await mount.ready, null)
  assert.equal(disconnects, 1)
  assert.equal(frames, 0, 'a destroyed gallery registered a frame after abort')
  assert.equal(microtasks, 0, 'a destroyed gallery queued microtask work after abort')
})


test('gallery masonry cleans up observer constructed during a synchronous abort', async () => {
  const controller = new AbortController()
  let disconnects = 0
  let frames = 0
  let microtasks = 0
  class OwnerResizeObserver {
    constructor() { controller.abort() }
    observe() { throw new Error('an aborted observer must not start') }
    disconnect() { disconnects++ }
  }
  const container = {
    ownerDocument: { defaultView: {
      ResizeObserver: OwnerResizeObserver,
      requestAnimationFrame() { frames++; return 1 },
      queueMicrotask() { microtasks++ },
    } },
    isConnected: false,
    getBoundingClientRect() { return { width: 0 } },
    classList: { add() {} },
  }
  const mount = mountGalleryMasonry(container, [], { signal: controller.signal })
  assert.equal(await mount.ready, null)
  assert.equal(disconnects, 1, 'the observer constructed after abort was never disconnected')
  assert.equal(frames, 0)
  assert.equal(microtasks, 0)
})

test('gallery masonry teardown continues after an observer disconnect failure', async () => {
  const controller = new AbortController()
  const failures = []
  let canceled = 0
  let disconnected = 0
  class OwnerResizeObserver {
    observe() {}
    disconnect() {
      disconnected++
      throw new Error('observer disconnect failed')
    }
  }
  const container = {
    ownerDocument: { defaultView: {
      ResizeObserver: OwnerResizeObserver,
      requestAnimationFrame() { return 41 },
      cancelAnimationFrame() { canceled++ },
      queueMicrotask() {},
    } },
    isConnected: false,
    getBoundingClientRect() { return { width: 0 } },
    classList: { add() {} },
  }
  const mount = mountGalleryMasonry(container, [], {
    signal: controller.signal,
    onError(error) { failures.push(error.message) },
  })
  assert.doesNotThrow(() => mount.destroy())
  assert.equal(await mount.ready, null)
  assert.equal(disconnected, 1)
  assert.equal(canceled, 1, 'a throwing observer skipped release of a pending frame')
  assert.deepEqual(failures, ['observer disconnect failed'])
  assert.equal(controller.signal.aborted, false)
})
