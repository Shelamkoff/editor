import test from 'node:test'
import assert from 'node:assert/strict'

import { Embed } from './index.js'

const paste = url => new Embed().onPaste({ type: 'pattern', data: url })

test('Embed accepts supported provider URL forms and extracts canonical ids', () => {
  assert.deepEqual(paste('https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ'), {
    service: 'youtube', videoId: 'dQw4w9WgXcQ', caption: '', cover: '', title: '', duration: '',
  })
  assert.equal(paste('https://youtu.be/dQw4w9WgXcQ?t=3')?.videoId, 'dQw4w9WgXcQ')
  assert.equal(paste('https://m.youtube.com/shorts/dQw4w9WgXcQ')?.videoId, 'dQw4w9WgXcQ')
  assert.equal(paste('https://vimeo.com/123456')?.videoId, '123456')
  assert.equal(paste('https://player.vimeo.com/video/123456')?.videoId, '123456')
})

test('Embed rejects provider-looking paths hosted by unrelated origins', () => {
  assert.equal(paste('https://example.com/youtube.com/watch?v=dQw4w9WgXcQ'), null)
  assert.equal(paste('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'), null)
  assert.equal(paste('https://vimeo.com.evil.test/123456'), null)
  assert.equal(paste('/watch?v=dQw4w9WgXcQ'), null)
  assert.equal(paste('javascript:https://youtu.be/dQw4w9WgXcQ'), null)
})
