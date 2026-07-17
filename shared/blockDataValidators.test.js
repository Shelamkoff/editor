import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BLOCK_DATA_VALIDATORS,
  validateAttachesData,
  validateChecklistData,
  validateColumnsData,
  validateEmbedData,
  validateGalleryData,
  validateImageData,
  validateLinkPreviewData,
  validatePersonData,
  validateTableData,
} from './blockDataValidators.js'
import { BLOCK_TYPES } from './blockTypes.js'

test('every built-in block type has a strict validator', () => {
  assert.deepEqual(Object.keys(BLOCK_DATA_VALIDATORS).sort(), [...BLOCK_TYPES].sort())
})

test('text and structural validators reject values their renderers would coerce', () => {
  assert.equal(BLOCK_DATA_VALIDATORS.paragraph({ text: 'body', align: 'justify' }), true)
  assert.equal(BLOCK_DATA_VALIDATORS.paragraph({ text: 'body', align: 'diagonal' }), false)
  assert.equal(BLOCK_DATA_VALIDATORS.heading({ text: 'title', level: 2 }), true)
  assert.equal(BLOCK_DATA_VALIDATORS.heading({ text: 'title', level: 1 }), false)
  assert.equal(BLOCK_DATA_VALIDATORS.list({ items: ['one'], style: 'unordered' }), true)
  assert.equal(BLOCK_DATA_VALIDATORS.list({ items: ['one'], style: 'invalid' }), false)
  assert.equal(BLOCK_DATA_VALIDATORS.quote({ text: 'quote', caption: '' }), true)
  assert.equal(BLOCK_DATA_VALIDATORS.code({ code: 'const x = 1', language: 'js' }), true)
  assert.equal(BLOCK_DATA_VALIDATORS.delimiter({}), true)
  assert.equal(BLOCK_DATA_VALIDATORS.warning({ title: '', message: 'note' }), true)
  assert.equal(BLOCK_DATA_VALIDATORS.raw({ html: '<p>safe</p>' }), true)
  assert.equal(BLOCK_DATA_VALIDATORS.toggle({ title: 'More', content: '', open: false }), true)
  assert.equal(BLOCK_DATA_VALIDATORS.spoiler({ label: '', content: 'hidden' }), true)
})

test('table and columns validators reject shapes that render would truncate', () => {
  assert.equal(validateTableData({ content: [['a', 'b'], ['c', 'd']], withHeadings: true }), true)
  assert.equal(validateTableData({ content: [['a', 'b'], ['c']] }), false)
  assert.equal(validateTableData({ content: [['a'], [1]] }), false)

  assert.equal(validateColumnsData({
    layout: '1-1-1',
    columns: [{ content: 'a' }, { content: 'b' }, { content: 'c' }],
  }), true)
  assert.equal(validateColumnsData({
    layout: '1-1',
    columns: [{ content: 'a' }, { content: 'b' }, { content: 'silently lost' }],
  }), false)
})

test('nested plugin schemas validate every item and URL-bearing field', () => {
  assert.equal(validateChecklistData({ items: [{ text: 'done', checked: true }] }), true)
  assert.equal(validateChecklistData({ items: [{ text: 'done', checked: 1 }] }), false)

  assert.equal(validateGalleryData({
    images: [{ url: '/image.jpg', caption: '' }],
    layout: 'auto',
    styles: { gap: '8px' },
    options: { loop: true, autoplayInterval: 3000 },
  }), true)
  assert.equal(validateGalleryData({
    images: [{ url: 'javascript:alert(1)' }],
    layout: 'auto',
  }), false)

  assert.equal(validateImageData({
    file: { url: 'data:image/png;base64,AA==', width: 100, height: 80 },
    caption: '',
  }), true)
  assert.equal(validateImageData({ file: { url: '/image.jpg', width: -1 } }), false)

  assert.equal(validateAttachesData({
    files: [{ url: '/file.pdf', name: 'file.pdf', extension: 'pdf', size: 10 }],
    variant: 'f',
  }), true)
  assert.equal(validateAttachesData({
    files: [{ url: 'data:text/html;base64,AA==', name: 'x', extension: 'html', size: 1 }],
  }), false)

  assert.equal(validatePersonData({
    persons: [{
      avatar: '/avatar.jpg', name: '', role: '', bio: '',
      links: [{ type: 'website', url: 'https://example.com' }],
    }],
  }), true)
  assert.equal(validatePersonData({
    persons: [{ avatar: '', name: '', role: '', bio: '', links: [{ type: 'x', url: 'javascript:x' }] }],
  }), false)
})

test('embed and link preview validators apply their declared URL and enum policies', () => {
  assert.equal(validateEmbedData({ service: 'youtube', videoId: 'abcdefghijk', cover: '/cover.jpg' }), true)
  assert.equal(validateEmbedData({ service: 'youtube', videoId: 'short' }), false)
  assert.equal(validateEmbedData({ service: 'unknown', videoId: '123' }), false)

  assert.equal(validateLinkPreviewData({
    url: 'https://example.com/page', title: '', description: '', image: '', favicon: '', domain: '', template: 'notion',
  }), true)
  assert.equal(validateLinkPreviewData({ url: 'mailto:user@example.com' }), false)
  assert.equal(validateLinkPreviewData({ url: '/relative', template: 'notion' }), false)
  assert.equal(validateLinkPreviewData({ url: '//example.com/page', template: 'notion' }), false)
})
