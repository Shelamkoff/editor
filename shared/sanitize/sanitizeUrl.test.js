import test from 'node:test'
import assert from 'node:assert/strict'

import {
  sanitizeUrl,
  sanitizeExternalUrl,
  sanitizeMediaUrl,
  sanitizeDownloadUrl,
} from './sanitizeUrl.js'

test('link policy preserves supported absolute and relative URLs', () => {
  assert.equal(sanitizeUrl('https://example.com/path'), 'https://example.com/path')
  assert.equal(sanitizeUrl('/relative/path'), '/relative/path')
  assert.equal(sanitizeUrl('#section'), '#section')
  assert.equal(sanitizeUrl('mailto:test@example.com'), 'mailto:test@example.com')
  assert.equal(sanitizeUrl('tel:+123456789'), 'tel:+123456789')
})

test('dangerous and obfuscated schemes are rejected', () => {
  assert.equal(sanitizeUrl('javascript:alert(1)'), '#')
  assert.equal(sanitizeUrl('java\nscript:alert(1)'), '#')
  assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '#')
  assert.equal(sanitizeUrl('file:///etc/passwd'), '#')
  assert.equal(sanitizeUrl('custom:payload'), '#')
})

test('javascript scheme fuzz corpus stays rejected after control and case obfuscation', () => {
  const controls = ['\u0000', '\u0008', '\u0009', '\u000a', '\u000d', '\u001f', '\u007f', ' ']
  let state = 0x6d2b79f5
  const random = () => {
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }

  for (let sample = 0; sample < 2000; sample++) {
    let scheme = ''
    for (const character of 'javascript') {
      if (random() < 0.65) scheme += controls[Math.floor(random() * controls.length)]
      scheme += random() < 0.5 ? character.toUpperCase() : character
      if (random() < 0.65) scheme += controls[Math.floor(random() * controls.length)]
    }
    assert.equal(sanitizeUrl(scheme + ':alert(1)'), '#', `accepted fuzz sample ${sample}`)
  }
})

test('external policy accepts only web URLs and relative references', () => {
  assert.equal(sanitizeExternalUrl('https://example.com'), 'https://example.com')
  assert.equal(sanitizeExternalUrl('mailto:test@example.com'), '#')
})

test('media policy permits raster data and blob URLs but rejects active data', () => {
  assert.equal(sanitizeMediaUrl('blob:https://example.com/id'), 'blob:https://example.com/id')
  assert.equal(sanitizeMediaUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=')
  assert.equal(sanitizeMediaUrl('data:image/svg+xml,<svg onload=alert(1)>'), '')
  assert.equal(sanitizeMediaUrl('data:text/html,<script>alert(1)</script>'), '')
})

test('download policy does not accept messaging protocols', () => {
  assert.equal(sanitizeDownloadUrl('https://example.com/file.pdf'), 'https://example.com/file.pdf')
  assert.equal(sanitizeDownloadUrl('blob:https://example.com/id'), 'blob:https://example.com/id')
  assert.equal(sanitizeDownloadUrl('mailto:test@example.com'), '')
})

test('download policy accepts inert raster data but rejects active data payloads', () => {
  assert.match(sanitizeDownloadUrl('data:image/png;base64,AA=='), /^data:image\/png/)
  assert.equal(sanitizeDownloadUrl('data:text/html;base64,PHNjcmlwdD4='), '')
  assert.equal(sanitizeDownloadUrl('data:image/svg+xml;base64,PHN2Zz4='), '')
})
