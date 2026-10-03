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
    files: [{ id: 'f1', url: 'javascript:alert(1)', name: 'x', extension: 'txt', size: 1 }],
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
      { id: 'g1', url: 'https://example.com/a.jpg', caption: 'A' },
      { id: 'g2', url: 'https://example.com/b.jpg', caption: 'B' },
    ],
  }).data
  const galleryKeys = []
  galleryDataSchema.mapRichText(gallery, (html, key) => {
    galleryKeys.push(key)
    return html
  })
  assert.deepEqual(galleryKeys, ['image:g1:caption', 'image:g2:caption'])

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


test('media schemas reject removed legacy shapes and versions', () => {
  assert.throws(
    () => galleryDataSchema.decode({
      dataVersion: 1,
      data: {
        ...galleryDataSchema.createDefault(),
        images: [{ url: 'https://example.com/a.jpg', caption: 'A' }],
      },
    }),
    /Unsupported data version 1/,
  )

  assert.throws(
    () => galleryDataSchema.decode({
      dataVersion: 2,
      data: {
        ...galleryDataSchema.createDefault(),
        layout: 'grid',
      },
    }),
    /Gallery layout is invalid/,
  )

  assert.throws(
    () => attachesDataSchema.decode({
      dataVersion: 2,
      data: {
        files: [{ url: 'https://example.com/a.pdf', name: 'A', extension: 'pdf', size: 10 }],
        variant: 'f',
      },
    }),
    /stable id/,
  )

  assert.throws(
    () => personDataSchema.decode({
      dataVersion: 2,
      data: {
        persons: [{
          avatar: '',
          name: 'A',
          role: '',
          bio: '',
          links: [],
        }],
      },
    }),
    /stable id/,
  )

  assert.throws(
    () => pollDataSchema.decode({
      dataVersion: 1,
      data: {
        question: 'Q',
        type: 'single',
        options: [
          { id: 'a', text: 'A', votes: 1 },
          { id: 'b', text: 'B' },
        ],
        resultsMode: 'always',
      },
    }),
    /votes are not part of canonical poll data/,
  )
})

test('gallery, attaches and person reject duplicate stable identities', () => {
  assert.throws(() => galleryDataSchema.encode({
    ...galleryDataSchema.createDefault(),
    images: [
      { id: 'x', url: 'https://example.com/a.jpg', caption: '' },
      { id: 'x', url: 'https://example.com/b.jpg', caption: '' },
    ],
  }), /Duplicate gallery image id/)

  assert.throws(() => attachesDataSchema.encode({
    files: [
      { id: 'x', url: 'https://example.com/a.pdf', name: 'A', extension: 'pdf', size: 1 },
      { id: 'x', url: 'https://example.com/b.pdf', name: 'B', extension: 'pdf', size: 1 },
    ],
    variant: 'f',
  }), /Duplicate attachment file id/)
})
