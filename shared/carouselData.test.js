import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeCarouselAspectRatio,
  normalizeCarouselData,
  validateCarouselData,
} from './carouselData.js'

const options = {
  loop: true, autoplay: false, autoplayDelay: 3000,
  navigation: true, pagination: true, thumbnails: false,
}

test('carousel schema validates stable identities, slide variants and options', () => {
  assert.equal(validateCarouselData({
    slides: [
      { id: 'image', type: 'image', src: '/image.jpg', alt: '', caption: '' },
      { id: 'video', type: 'video', src: '/video.mp4', poster: '/poster.jpg' },
      { id: 'html', type: 'html', html: '<p>Safe</p>' },
    ],
    options: { ...options, aspectRatio: '16 / 9' },
  }), true)
  assert.equal(validateCarouselData({
    slides: [{ id: 'same', type: 'image', src: '/a.jpg' }, { id: 'same', type: 'image', src: '/b.jpg' }],
    options,
  }), false)
  assert.equal(validateCarouselData({ slides: [{ id: 'x', type: 'image', src: 'javascript:x' }], options }), false)
  assert.equal(validateCarouselData({ slides: [{ id: 'x', type: 'image', src: '' }], options }), false)
  assert.equal(validateCarouselData({ slides: [{ id: 'x', type: 'video', src: '' }], options }), false)
  assert.equal(validateCarouselData({ slides: [{ id: 'x', type: 'html', html: '' }], options }), false)
  assert.equal(validateCarouselData({ slides: [{ id: 'x', type: 'image', src: '/x.jpg' }], options: { ...options, autoplayDelay: 0 } }), false)
  assert.equal(validateCarouselData({ slides: [{ id: 'x', type: 'image', src: '/x.jpg' }], options: { ...options, aspectRatio: '0 / 9' } }), false)
  assert.equal(validateCarouselData({ slides: [{ id: 'x', type: 'image', src: '/x.jpg' }], options: { ...options, aspectRatio: '16 / 0' } }), false)
})

test('carousel aspect ratio normalization rejects zero and malformed components', () => {
  assert.equal(normalizeCarouselAspectRatio(' auto '), 'auto')
  assert.equal(normalizeCarouselAspectRatio('16 / 9'), '16 / 9')
  assert.equal(normalizeCarouselAspectRatio('0 / 9'), undefined)
  assert.equal(normalizeCarouselAspectRatio('16 / 0'), undefined)
  assert.equal(normalizeCarouselAspectRatio('Infinity / 9'), undefined)

  let id = 0
  const normalized = normalizeCarouselData({
    slides: [],
    options: { ...options, aspectRatio: '0 / 0' },
  }, () => `slide-${++id}`)
  assert.equal(normalized.options.aspectRatio, undefined)
})
