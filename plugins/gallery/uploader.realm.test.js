import test from 'node:test'
import assert from 'node:assert/strict'
import { GalleryUploader } from './uploader.js'

class OwnerFileReader {
  readyState = 0
  result = null
  error = null
  onload = null
  onerror = null
  onabort = null
  readAsDataURL() {
    this.readyState = 1
    this.result = 'data:image/png;base64,AA=='
    queueMicrotask(() => { this.readyState = 2; this.onload?.() })
  }
  abort() { this.readyState = 2; this.onabort?.() }
}

test('GalleryUploader reads local files through the owning window FileReader', async () => {
  const previous = globalThis.FileReader
  globalThis.FileReader = class { constructor() { throw new Error('ambient FileReader must not be used') } }
  try {
    const ownerDocument = /** @type {Document} */ ({
      defaultView: { FileReader: OwnerFileReader, AbortController },
    })
    let result
    await new GalleryUploader({}).handle(
      [/** @type {File} */ ({})],
      value => { result = value },
      undefined,
      ownerDocument,
    )
    assert.deepEqual(result, [{ url: 'data:image/png;base64,AA==', caption: '' }])
  } finally {
    if (previous === undefined) delete globalThis.FileReader
    else globalThis.FileReader = previous
  }
})
