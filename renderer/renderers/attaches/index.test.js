import assert from 'node:assert/strict'
import test from 'node:test'
import { ARCHIVE_LIMITS, downloadArchive, sanitizeArchiveFilename } from './index.js'
import { getZipRuntime, setZipRuntime } from '../../../shared/zipRuntime.js'

test('ZIP entry names cannot escape the archive root or use reserved names', () => {
  assert.equal(sanitizeArchiveFilename('../../private.txt'), '.._.._private.txt')
  assert.equal(sanitizeArchiveFilename('folder\\nested/file.txt'), 'folder_nested_file.txt')
  assert.equal(sanitizeArchiveFilename('CON.txt', 2), 'file-3')
  assert.equal(sanitizeArchiveFilename('name. '), 'name')
  assert.equal(sanitizeArchiveFilename('', 4), 'file-5')
  assert.ok(sanitizeArchiveFilename('x'.repeat(200)).length <= 128)
})

test('ZIP limits and cancellation fail before loading or fetching attachments', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    downloadArchive([], { signal: controller.signal }),
    error => error?.name === 'AbortError',
  )

  const files = Array.from({ length: ARCHIVE_LIMITS.files + 1 }, (_, index) => ({
    url: `/file-${index}`,
    name: `file-${index}`,
  }))
  await assert.rejects(
    downloadArchive(files, { signal: new AbortController().signal }),
    /Too many attachments/,
  )
})


test('ZIP safety failure aborts sibling downloads without aborting caller signal', async () => {
  const originalFetch = globalThis.fetch
  const caller = new AbortController()
  let siblingSignal = null
  let releaseSibling
  let calls = 0

  globalThis.fetch = async (_url, options = {}) => {
    calls += 1
    if (calls === 1) {
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-length': String(ARCHIVE_LIMITS.fileBytes + 1) },
      })
    }
    siblingSignal = options.signal
    return await new Promise((resolve, reject) => {
      releaseSibling = () => reject(new Error('test cleanup'))
      if (options.signal?.aborted) reject(options.signal.reason)
      else options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    })
  }

  try {
    await assert.rejects(
      downloadArchive([
        { url: 'https://example.test/oversized.bin', name: 'oversized.bin' },
        { url: 'https://example.test/sibling.bin', name: 'sibling.bin' },
      ], { signal: caller.signal }),
      /per-file ZIP limit/,
    )
    assert.ok(siblingSignal, 'a concurrent sibling request should start')
    assert.equal(siblingSignal.aborted, true, 'the archive operation should abort sibling work')
    assert.equal(caller.signal.aborted, false, 'archive-local cancellation must not abort the caller')
  } finally {
    releaseSibling?.()
    globalThis.fetch = originalFetch
  }
})


test('ZIP download uses the owning document fetch realm', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('ambient fetch must not be used') }
  const ownerDocument = {
    defaultView: {
      AbortController,
      fetch: async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-length': String(ARCHIVE_LIMITS.fileBytes + 1) },
      }),
    },
  }

  try {
    await assert.rejects(
      downloadArchive([
        { url: 'https://example.test/file.bin', name: 'file.bin' },
      ], { signal: new AbortController().signal, ownerDocument }),
      /per-file ZIP limit/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})


test('ZIP output is built as an owning-window Blob from byte data', async () => {
  const previousRuntime = getZipRuntime()
  /** @type {Uint8Array[]} */
  const archivedContents = []
  class FakeZip {
    file(_name, content) { archivedContents.push(content) }
    async generateAsync(options) {
      assert.deepEqual(options, { type: 'uint8array' })
      return new Uint8Array([7, 8, 9])
    }
  }
  setZipRuntime(FakeZip)

  class OwnerBlob extends Blob {}
  let createdBlob = null
  let revoked = ''
  let clicked = 0
  const ownerDocument = {
    defaultView: {
      AbortController,
      Blob: OwnerBlob,
      fetch: async () => new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      }),
      URL: {
        createObjectURL(blob) { createdBlob = blob; return 'blob:owner/archive' },
        revokeObjectURL(url) { revoked = url },
      },
      setTimeout(callback) { callback(); return 1 },
    },
    createElement() {
      return {
        setAttribute() {},
        download: '',
        click() { clicked += 1 },
      }
    },
  }

  try {
    await downloadArchive([
      { url: 'https://example.test/file.bin', name: 'file.bin' },
    ], { signal: new AbortController().signal, ownerDocument })
    assert.equal(archivedContents.length, 1)
    assert.ok(archivedContents[0] instanceof Uint8Array)
    assert.ok(createdBlob instanceof OwnerBlob)
    assert.equal(clicked, 1)
    assert.equal(revoked, 'blob:owner/archive')
  } finally {
    setZipRuntime(previousRuntime)
  }
})


test('ZIP export revokes its Blob URL if anchor creation, click or timer setup fails', async () => {
  const previousRuntime = getZipRuntime()
  class FakeZip {
    file() {}
    async generateAsync() { return new Uint8Array([1, 2, 3]) }
  }
  setZipRuntime(FakeZip)

  const failures = ['anchor', 'click', 'timer', 'click-with-revoke-error']
  try {
    for (const failure of failures) {
      const revoked = []
      const expectedFailure = failure.startsWith('click') ? 'click' : failure
      const ownerDocument = {
        defaultView: {
          AbortController,
          fetch: async () => new Response(new Uint8Array([42]), { status: 200 }),
          Blob,
          URL: {
            createObjectURL() { return 'blob:owner/failed-archive' },
            revokeObjectURL(url) {
              revoked.push(url)
              if (failure === 'click-with-revoke-error') throw new Error('URL revocation failed')
            },
          },
          setTimeout(callback) {
            if (failure === 'timer') throw new Error('timer failed')
            callback()
          },
        },
        createElement() {
          if (failure === 'anchor') throw new Error('anchor failed')
          return {
            download: '',
            setAttribute() {},
            click() { if (failure.startsWith('click')) throw new Error('click failed') },
          }
        },
      }

      await assert.rejects(
        downloadArchive(
          [{ url: 'https://example.test/export.bin', name: 'export.bin' }],
          { signal: new AbortController().signal, ownerDocument },
        ),
        new RegExp(expectedFailure + ' failed'),
        failure,
      )
      assert.deepEqual(revoked, ['blob:owner/failed-archive'],
        `Blob URL leaked or was revoked twice after ${failure} failure`)
    }
  } finally {
    setZipRuntime(previousRuntime)
  }
})


test('ZIP export canceled by attachment input normalization cannot start a fetch', async () => {
  const originalZip = getZipRuntime()
  const caller = new AbortController()
  let fetches = 0
  let filesWritten = 0
  class FakeZip {
    file() { filesWritten++ }
    async generateAsync() { return new Uint8Array([1]) }
  }
  setZipRuntime(FakeZip)
  const ownerDocument = {
    defaultView: {
      AbortController,
      fetch: async () => {
        fetches++
        return new Response(new Uint8Array([1]), { status: 200 })
      },
    },
  }

  try {
    await assert.rejects(
      downloadArchive([{
        get url() {
          caller.abort()
          return 'https://example.test/canceled.bin'
        },
        name: 'canceled.bin',
      }], { signal: caller.signal, ownerDocument }),
      error => error?.name === 'AbortError',
    )
    assert.equal(fetches, 0, 'a canceled file list started a network request')
    assert.equal(filesWritten, 0, 'a canceled file list was added to the ZIP')
  } finally {
    setZipRuntime(originalZip)
  }
})

test('ZIP export cannot add a delayed Blob response after caller cancellation', async () => {
  const originalZip = getZipRuntime()
  const caller = new AbortController()
  let filesWritten = 0
  let releaseBlob
  let blobEntered
  const enteredBlob = new Promise(resolve => { blobEntered = resolve })
  const pendingBlob = new Promise(resolve => { releaseBlob = resolve })
  class FakeZip {
    file() { filesWritten++ }
    async generateAsync() { return new Uint8Array([1]) }
  }
  setZipRuntime(FakeZip)
  const ownerDocument = {
    defaultView: {
      AbortController,
      fetch: async () => ({
        ok: true,
        headers: { get: () => null },
        body: null,
        blob() { blobEntered(); return pendingBlob },
      }),
    },
  }

  try {
    const pending = downloadArchive(
      [{ url: 'https://example.test/slow.bin', name: 'slow.bin' }],
      { signal: caller.signal, ownerDocument },
    )
    await enteredBlob
    caller.abort()
    releaseBlob({
      size: 3,
      async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer },
    })
    await assert.rejects(pending, error => error?.name === 'AbortError')
    assert.equal(filesWritten, 0, 'an aborted Blob response was added to the archive')
  } finally {
    setZipRuntime(originalZip)
  }
})

test('ZIP export cannot add a stream that finishes after caller cancellation', async () => {
  const originalZip = getZipRuntime()
  const caller = new AbortController()
  let filesWritten = 0
  let canceledReads = 0
  let releaseRead
  let readEntered
  const enteredRead = new Promise(resolve => { readEntered = resolve })
  const pendingRead = new Promise(resolve => { releaseRead = resolve })
  class FakeZip {
    file() { filesWritten++ }
    async generateAsync() { return new Uint8Array([1]) }
  }
  setZipRuntime(FakeZip)
  const ownerDocument = {
    defaultView: {
      AbortController,
      fetch: async () => ({
        ok: true,
        headers: { get: () => null },
        body: {
          getReader() {
            return {
              read() { readEntered(); return pendingRead },
              async cancel() { canceledReads++ },
            }
          },
        },
      }),
    },
  }

  try {
    const pending = downloadArchive(
      [{ url: 'https://example.test/stream.bin', name: 'stream.bin' }],
      { signal: caller.signal, ownerDocument },
    )
    await enteredRead
    caller.abort()
    releaseRead({ done: true })
    await assert.rejects(pending, error => error?.name === 'AbortError')
    assert.equal(filesWritten, 0, 'an aborted stream was added to the archive')
    assert.equal(canceledReads, 1, 'a stale reader was not canceled')
  } finally {
    setZipRuntime(originalZip)
  }
})


test('ZIP export canceled during Blob construction does not create or click a URL', async () => {
  const previousRuntime = getZipRuntime()
  const caller = new AbortController()
  let urlsCreated = 0
  let clicked = 0
  class FakeZip {
    file() {}
    async generateAsync() { return new Uint8Array([1, 2]) }
  }
  class CancelingBlob extends Blob {
    constructor(parts, options) {
      super(parts, options)
      caller.abort()
    }
  }
  setZipRuntime(FakeZip)
  const ownerDocument = {
    defaultView: {
      AbortController,
      Blob: CancelingBlob,
      fetch: async () => new Response(new Uint8Array([42]), { status: 200 }),
      URL: {
        createObjectURL() { urlsCreated++; return 'blob:owner/unwanted' },
        revokeObjectURL() {},
      },
    },
    createElement() { clicked++; throw new Error('canceled export must not create an anchor') },
  }

  try {
    await assert.rejects(
      downloadArchive([{ url: 'https://example.test/file', name: 'file' }],
        { signal: caller.signal, ownerDocument }),
      error => error?.name === 'AbortError',
    )
    assert.equal(urlsCreated, 0)
    assert.equal(clicked, 0)
  } finally {
    setZipRuntime(previousRuntime)
  }
})

test('ZIP export cancellation inside URL creation revokes URL without clicking', async () => {
  const previousRuntime = getZipRuntime()
  const caller = new AbortController()
  const revoked = []
  let clicked = 0
  class FakeZip {
    file() {}
    async generateAsync() { return new Uint8Array([1, 2]) }
  }
  setZipRuntime(FakeZip)
  const ownerDocument = {
    defaultView: {
      AbortController,
      Blob,
      fetch: async () => new Response(new Uint8Array([42]), { status: 200 }),
      URL: {
        createObjectURL() { caller.abort(); return 'blob:owner/canceled' },
        revokeObjectURL(url) { revoked.push(url) },
      },
      setTimeout(callback) { callback() },
    },
    createElement() { clicked++; throw new Error('canceled export must not create an anchor') },
  }

  try {
    await assert.rejects(
      downloadArchive([{ url: 'https://example.test/file', name: 'file' }],
        { signal: caller.signal, ownerDocument }),
      error => error?.name === 'AbortError',
    )
    assert.equal(clicked, 0)
    assert.deepEqual(revoked, ['blob:owner/canceled'])
  } finally {
    setZipRuntime(previousRuntime)
  }
})

test('ZIP export cancellation during href publication never triggers anchor.click', async () => {
  const previousRuntime = getZipRuntime()
  const caller = new AbortController()
  const revoked = []
  let clicked = 0
  class FakeZip {
    file() {}
    async generateAsync() { return new Uint8Array([1, 2]) }
  }
  setZipRuntime(FakeZip)
  const ownerDocument = {
    defaultView: {
      AbortController,
      Blob,
      fetch: async () => new Response(new Uint8Array([42]), { status: 200 }),
      URL: {
        createObjectURL() { return 'blob:owner/canceled-attribute' },
        revokeObjectURL(url) { revoked.push(url) },
      },
      setTimeout(callback) { callback() },
    },
    createElement() {
      return {
        setAttribute() { caller.abort() },
        click() { clicked++ },
        download: '',
      }
    },
  }

  try {
    await assert.rejects(
      downloadArchive([{ url: 'https://example.test/file', name: 'file' }],
        { signal: caller.signal, ownerDocument }),
      error => error?.name === 'AbortError',
    )
    assert.equal(clicked, 0)
    assert.deepEqual(revoked, ['blob:owner/canceled-attribute'])
  } finally {
    setZipRuntime(previousRuntime)
  }
})


test('ZIP export rejects a fetch that settles after abort without reading its body', async () => {
  const previousRuntime = getZipRuntime()
  const caller = new AbortController()
  let releaseFetch
  let enteredFetch
  const started = new Promise(resolve => { enteredFetch = resolve })
  const pendingFetch = new Promise(resolve => { releaseFetch = resolve })
  let headerReads = 0
  let filesWritten = 0
  class FakeZip {
    file() { filesWritten++ }
    async generateAsync() { return new Uint8Array([1]) }
  }
  setZipRuntime(FakeZip)
  const ownerDocument = {
    defaultView: {
      AbortController,
      fetch() { enteredFetch(); return pendingFetch },
    },
  }

  try {
    const pending = downloadArchive(
      [{ url: 'https://example.test/delayed-fetch', name: 'delayed-fetch' }],
      { signal: caller.signal, ownerDocument },
    )
    await started
    caller.abort()
    releaseFetch({
      ok: true,
      get headers() {
        headerReads++
        return { get: () => null }
      },
      body: null,
      async blob() {
        return { size: 1, async arrayBuffer() { return new Uint8Array([1]).buffer } }
      },
    })
    await assert.rejects(pending, error => error?.name === 'AbortError')
    assert.equal(headerReads, 0, 'a retired fetch read headers after cancellation')
    assert.equal(filesWritten, 0)
  } finally {
    setZipRuntime(previousRuntime)
  }
})

test('ZIP export rejects delayed arrayBuffer completion after abort without writing ZIP entry', async () => {
  const previousRuntime = getZipRuntime()
  const caller = new AbortController()
  let releaseBytes
  let enteredBytes
  const started = new Promise(resolve => { enteredBytes = resolve })
  const pendingBytes = new Promise(resolve => { releaseBytes = resolve })
  let filesWritten = 0
  class FakeZip {
    file() { filesWritten++ }
    async generateAsync() { return new Uint8Array([1]) }
  }
  setZipRuntime(FakeZip)
  const ownerDocument = {
    defaultView: {
      AbortController,
      fetch: async () => ({
        ok: true,
        headers: { get: () => null },
        body: null,
        async blob() {
          return { size: 1, arrayBuffer() { enteredBytes(); return pendingBytes } }
        },
      }),
    },
  }

  try {
    const pending = downloadArchive(
      [{ url: 'https://example.test/delayed-buffer', name: 'delayed-buffer' }],
      { signal: caller.signal, ownerDocument },
    )
    await started
    caller.abort()
    releaseBytes(new Uint8Array([1]).buffer)
    await assert.rejects(pending, error => error?.name === 'AbortError')
    assert.equal(filesWritten, 0, 'an aborted arrayBuffer continuation wrote an archive entry')
  } finally {
    setZipRuntime(previousRuntime)
  }
})


test('failed streaming attachment releases its provisional bytes so valid files fit the ZIP total limit', async () => {
  const previousRuntime = getZipRuntime()
  const caller = new AbortController()
  const accepted = []
  let clicked = 0
  let releaseLarge
  const largeGate = new Promise(resolve => { releaseLarge = resolve })
  const largeBytes = new Uint8Array(25 * 1024 * 1024).buffer
  const failedChunk = new Uint8Array(24 * 1024 * 1024)
  const smallBytes = new Uint8Array(2 * 1024 * 1024).buffer

  class FakeZip {
    file(name, bytes) {
      accepted.push([name, bytes.byteLength])
      // Make the final 2 MiB success settle before the three staged 25 MiB
      // files. The failed 24 MiB stream must no longer count toward 100 MiB.
      if (name === 'small.bin') releaseLarge()
    }
    async generateAsync() { return new Uint8Array([1]) }
  }
  setZipRuntime(FakeZip)

  const ownerDocument = {
    defaultView: {
      AbortController,
      Blob,
      fetch: async url => {
        if (url.endsWith('/broken')) {
          let reads = 0
          return {
            ok: true,
            headers: { get: () => null },
            body: {
              getReader() {
                return {
                  async read() {
                    if (reads++ === 0) return { done: false, value: failedChunk }
                    throw new Error('connection dropped')
                  },
                  async cancel() {},
                }
              },
            },
          }
        }
        const isSmall = url.endsWith('/small')
        const data = isSmall ? smallBytes : largeBytes
        return {
          ok: true,
          headers: { get: () => null },
          body: null,
          async blob() {
            return {
              size: data.byteLength,
              async arrayBuffer() {
                if (!isSmall) await largeGate
                return data
              },
            }
          },
        }
      },
      URL: {
        createObjectURL() { return 'blob:owner/accounting' },
        revokeObjectURL() {},
      },
      setTimeout(callback) { callback() },
    },
    createElement() {
      return { setAttribute() {}, download: '', click() { clicked++ } }
    },
  }

  try {
    await downloadArchive([
      { url: 'https://example.test/broken', name: 'broken.bin' },
      { url: 'https://example.test/large-a', name: 'large-a.bin' },
      { url: 'https://example.test/large-b', name: 'large-b.bin' },
      { url: 'https://example.test/large-c', name: 'large-c.bin' },
      { url: 'https://example.test/small', name: 'small.bin' },
    ], { signal: caller.signal, ownerDocument })

    assert.deepEqual(accepted.map(([name]) => name).sort(),
      ['large-a.bin', 'large-b.bin', 'large-c.bin', 'small.bin'].sort())
    assert.equal(clicked, 1)
    assert.equal(caller.signal.aborted, false)
  } finally {
    releaseLarge?.()
    setZipRuntime(previousRuntime)
  }
})
