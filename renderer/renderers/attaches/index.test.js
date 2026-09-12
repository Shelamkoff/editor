import assert from 'node:assert/strict'
import test from 'node:test'
import { ARCHIVE_LIMITS, downloadArchive, sanitizeArchiveFilename } from './index.js'

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
