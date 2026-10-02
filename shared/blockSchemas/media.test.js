import test from 'node:test'
import assert from 'node:assert/strict'

import { imageDataSchema } from './image.js'
import { galleryDataSchema } from './gallery.js'
import { embedDataSchema } from './embed.js'
import { linkPreviewDataSchema } from './linkPreview.js'
import { attachesDataSchema } from './attaches.js'
import { personDataSchema } from './person.js'
import { pollDataSchema } from './poll.js'
import { carouselDataSchema } from './carousel.js'

test('media schemas expose editor-valid defaults', () => {
  for (const schema of [
    imageDataSchema,
    galleryDataSchema,
    embedDataSchema,
    linkPreviewDataSchema,
    attachesDataSchema,
    personDataSchema,
    pollDataSchema,
    carouselDataSchema,
  ]) {
    const value = schema.createDefault()
    assert.deepEqual(schema.encode(value).data, value)
  }
})

test('media schemas reject unsafe local URLs instead of silently preserving them', () => {
  assert.throws(() => imageDataSchema.encode({
    ...imageDataSchema.createDefault(),
    file: { url: 'javascript:alert(1)' },
  }), /canonical/)

  assert.throws(() => linkPreviewDataSchema.encode({
    ...linkPreviewDataSchema.createDefault(),
    url: 'javascript:alert(1)',
  }), /canonical/)

  assert.throws(() => attachesDataSchema.encode({
    files: [{ url: 'javascript:alert(1)', name: 'x', extension: 'txt', size: 1 }],
    variant: 'f',
  }), /canonical/)
})

test('poll and carousel stable identities are unique', () => {
  assert.throws(() => pollDataSchema.encode({
    question: '',
    type: 'single',
    resultsMode: 'always',
    options: [
      { id: 'x', text: '' },
      { id: 'x', text: '' },
    ],
  }), /Duplicate poll option id/)

  assert.throws(() => carouselDataSchema.encode({
    slides: [
      { id: 'x', type: 'image', src: 'https://example.com/a.jpg', caption: '' },
      { id: 'x', type: 'image', src: 'https://example.com/b.jpg', caption: '' },
    ],
    options: carouselDataSchema.createDefault().options,
  }), /Duplicate carousel slide id/)
})

test('gallery and carousel rich-text captions use deterministic field keys', () => {
  const gallery = galleryDataSchema.encode({
    ...galleryDataSchema.createDefault(),
    images: [
      { url: 'https://example.com/a.jpg', caption: 'A' },
      { url: 'https://example.com/b.jpg', caption: 'B' },
    ],
  }).data
  const galleryKeys = []
  galleryDataSchema.mapRichText(gallery, (html, key) => {
    galleryKeys.push(key)
    return html
  })
  assert.deepEqual(galleryKeys, ['caption:0', 'caption:1'])

  const carousel = carouselDataSchema.encode({
    ...carouselDataSchema.createDefault(),
    slides: [
      { id: 's1', type: 'image', src: 'https://example.com/a.jpg', alt: '', caption: 'A' },
    ],
  }).data
  const carouselKeys = []
  carouselDataSchema.mapRichText(carousel, (html, key) => {
    carouselKeys.push(key)
    return html
  })
  assert.deepEqual(carouselKeys, ['slide:s1:caption'])
})
