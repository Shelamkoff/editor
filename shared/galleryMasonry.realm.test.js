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
