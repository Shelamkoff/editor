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
