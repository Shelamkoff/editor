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
    if (previousRuntime) setZipRuntime(previousRuntime)
  }
})
