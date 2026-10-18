import test from 'node:test'
import assert from 'node:assert/strict'

import { createCarouselPlugin } from './index.js'

test('Carousel file Paste preserves v1 video source through the clipboard-owned blob lease', async () => {
  const plugin = createCarouselPlugin({ injectStyles: false })
  const acquired = []
  let ids = 0
  const file = { type: 'video/mp4', name: 'clip.mp4', size: 123 }
  const context = {
    signal: new AbortController().signal,
    ownerDocument: {
      defaultView: {
        FileReader: class {
          readAsDataURL() {
            throw new Error('video Paste must never attempt a data: URL read')
          }
        },
      },
    },
    createId: prefix => prefix + '-' + (++ids),
    createObjectURL(value) {
      assert.strictEqual(value, file)
      acquired.push(value)
      return 'blob:rector-video-paste-1'
    },
  }
  assert.equal(plugin.capabilities.paste.accepts({ kind: 'file', file }), true)
  const result = await plugin.capabilities.paste.resolve({ kind: 'file', file }, context)
  assert.equal(acquired.length, 1)
  assert.equal(ids, 1)
  assert.equal(result.kind, 'block')
  assert.equal(result.data.slides.length, 1)
  assert.deepEqual(result.data.slides[0], {
    id: 'slide-1',
    type: 'video',
    src: 'blob:rector-video-paste-1',
    poster: undefined,
    alt: 'clip.mp4',
    caption: '',
  })
})

test('Carousel file Paste keeps image reads as data URLs and does not allocate blobs', async () => {
  const plugin = createCarouselPlugin({ injectStyles: false })
  let blobs = 0
  const file = { type: 'image/png', name: 'picture.png', size: 123 }
  class Reader {
    result = null
    readAsDataURL() {
      this.result = 'data:image/png;base64,AA=='
      this.onload?.()
    }
  }
  const result = await plugin.capabilities.paste.resolve({ kind: 'file', file }, {
    signal: new AbortController().signal,
    ownerDocument: { defaultView: { FileReader: Reader } },
    createId: prefix => prefix + '-1',
    createObjectURL() { blobs++; throw new Error('images should not be blob-backed') },
  })
  assert.equal(blobs, 0)
  assert.equal(result.data.slides[0].type, 'image')
  assert.equal(result.data.slides[0].src, 'data:image/png;base64,AA==')
})

test('Carousel remote upload Paste does not allocate temporary blob URLs', async () => {
  let blobs = 0
  const plugin = createCarouselPlugin({
    injectStyles: false,
    uploadFile: async () => ({ url: 'https://cdn.example.test/video.mp4' }),
  })
  const result = await plugin.capabilities.paste.resolve({
    kind: 'file', file: { name: 'video.mp4', type: 'video/mp4' },
  }, {
    signal: new AbortController().signal,
    ownerDocument: { defaultView: {} },
    createId: prefix => prefix + '-1',
    createObjectURL() { blobs++; return 'blob:wrong' },
  })
  assert.equal(blobs, 0)
  assert.equal(result.data.slides[0].src, 'https://cdn.example.test/video.mp4')
})
