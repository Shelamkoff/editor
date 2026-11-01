import assert from 'node:assert/strict'
import test from 'node:test'
import { downloadArchive } from './index.js'
import { getZipRuntime, setZipRuntime } from '../../../shared/zipRuntime.js'

function fixture(response) {
  const files = [], downloads = []
  const ownerDocument = {
    defaultView: {
      AbortController, Blob,
      fetch: async () => response,
      URL: { createObjectURL: () => 'blob:stream-test', revokeObjectURL() {} },
      setTimeout(callback) { callback() },
    },
    createElement: () => ({ setAttribute() {}, click() { downloads.push('files.zip') } }),
  }
  return { files, downloads, ownerDocument }
}

for (const cleanup of ['complete', 'pending', 'rejected']) test(`cancelled ZIP releases its pending reader when source cancellation is ${cleanup}`, { timeout: 2000 }, async () => {
  const previous = getZipRuntime(), caller = new AbortController(), reason = new Error('owner retired')
  let streamController, reading, cancelled
  const entered = new Promise(resolve => { reading = resolve })
  const stream = new ReadableStream({
    start(controller) { streamController = controller },
    pull() { reading() },
    cancel(value) {
      cancelled = value
      if (cleanup === 'pending') return new Promise(() => {})
      if (cleanup === 'rejected') return Promise.reject(new Error('source cleanup failed'))
    },
  }, { highWaterMark: 0 })
  const f = fixture(new Response(stream))
  setZipRuntime(class {
    file(name) { f.files.push(name) }
    async generateAsync() { return new Uint8Array([1]) }
  })
  const pending = downloadArchive([{ url: '/pending', name: 'pending.bin' }], { signal: caller.signal, ownerDocument: f.ownerDocument })
  // Observe rejection immediately, including while the explicit assertion fails.
  const outcome = pending.then(() => null, error => error)
  try {
    await entered
    caller.abort(reason)
    await Promise.resolve()
    assert.equal(cancelled, reason, 'abort must cancel the owned stream without waiting for another chunk')
    assert.equal(await outcome, reason)
    assert.equal(stream.locked, false, 'retired reader retained its stream lock')
    assert.deepEqual(f.files, [])
    assert.deepEqual(f.downloads, [])
  } finally {
    // Release the pre-fix read as well, so RED leaves no pending operation.
    try { streamController.close() } catch {}
    await outcome
    setZipRuntime(previous)
  }
})

test('successful ZIP reads release their stream lock and preserve bytes', async () => {
  const previous = getZipRuntime()
  const response = new Response(new Uint8Array([0, 127, 255]))
  const f = fixture(response)
  setZipRuntime(class {
    file(name, bytes) { f.files.push({ name, bytes: [...bytes] }) }
    async generateAsync() { return new Uint8Array([1]) }
  })
  try {
    await downloadArchive([{ url: '/bytes', name: 'bytes.bin' }], { signal: new AbortController().signal, ownerDocument: f.ownerDocument })
    assert.deepEqual(f.files, [{ name: 'bytes.bin', bytes: [0, 127, 255] }])
    assert.deepEqual(f.downloads, ['files.zip'])
    assert.equal(response.body.locked, false, 'completed reader retained its stream lock')
  } finally { setZipRuntime(previous) }
})
