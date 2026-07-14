import test from 'node:test'
import assert from 'node:assert/strict'

import { validateCarouselData } from './carouselData.js'

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
  assert.equal(validateCarouselData({ slides: [{ id: 'x', type: 'html', html: '' }], options }), false)
  assert.equal(validateCarouselData({ slides: [{ id: 'x', type: 'image', src: '/x.jpg' }], options: { ...options, autoplayDelay: 0 } }), false)
})
