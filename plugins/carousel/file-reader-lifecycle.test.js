import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { createCarouselPlugin } from './index.js'
import { observeCompletion } from '../../tests/helpers/controlledFileReader.js'

function setup({ throwOnStart = false } = {}) {
  const readers = []
  class Reader {
    result = null
    onload = null
    onerror = null
    onabort = null
    abortCalls = 0
    constructor() { readers.push(this) }
    readAsDataURL() {
      if (throwOnStart) throw new Error('cannot read this file')
    }
    abort() {
      this.abortCalls++
      // A FileReader adapter may settle without sending an abort event.
    }
    complete(value = 'data:image/png;base64,AA==') {
      this.result = value
      this.onload?.()
    }
  }
  const controller = new AbortController()
  const ownerDocument = { defaultView: { FileReader: Reader, AbortController } }
  let generatedIds = 0
  const context = {
    ownerDocument,
    signal: controller.signal,
    createId(prefix) { generatedIds++; return prefix + '-' + generatedIds },
  }
  const paste = createCarouselPlugin({ injectStyles: false }).capabilities.paste
  const input = { kind: 'file', file: { name: 'image.png', type: 'image/png', size: 9 } }
  return {
    readers, controller, context, paste, input,
    get generatedIds() { return generatedIds },
  }
}

test('Carousel file import rejects an already aborted signal without starting a reader', async () => {
  const h = setup()
  h.controller.abort()
  const promise = h.paste.resolve(h.input, h.context)
  const result = await observeCompletion(promise, () => {})
  assert.equal(result.status, 'rejected', 'an already aborted paste must not await an orphan FileReader')
  assert.equal(h.readers.length, 0, 'canceled import opened a FileReader')
  assert.equal(getEventListeners(h.controller.signal, 'abort').length, 0)
  assert.equal(h.generatedIds, 0)
})

test('Carousel reader abort settles even without an onabort event and prevents late import', async () => {
  const h = setup()
  const promise = h.paste.resolve(h.input, h.context)
  assert.equal(h.readers.length, 1)
  const reader = h.readers[0]
  const staleOnLoad = reader.onload
  const result = await observeCompletion(promise, () => h.controller.abort())
  assert.equal(result.status, 'rejected', 'abort did not settle pending image conversion')
  assert.equal(reader.abortCalls, 1)
  assert.deepEqual([reader.onload, reader.onerror, reader.onabort], [null, null, null])
  assert.equal(getEventListeners(h.controller.signal, 'abort').length, 0)
  reader.result = 'data:image/png;base64,AQ=='
  staleOnLoad?.()
  assert.equal(h.generatedIds, 0, 'late FileReader load resurrected a canceled paste')
})

test('Carousel synchronous read failure removes the abort lease and rejects the import', async () => {
  const h = setup({ throwOnStart: true })
  const result = await observeCompletion(h.paste.resolve(h.input, h.context), () => {})
  assert.equal(result.status, 'rejected')
  assert.match(result.rejection?.message ?? '', /cannot read this file/)
  assert.equal(h.readers.length, 1)
  assert.equal(getEventListeners(h.controller.signal, 'abort').length, 0,
    'failed FileReader retained an AbortSignal callback and its owning document')
  assert.deepEqual([h.readers[0].onload, h.readers[0].onerror, h.readers[0].onabort], [null, null, null])
  h.controller.abort()
  assert.equal(h.readers[0].abortCalls, 0)
})

test('Carousel successful import removes FileReader callbacks and creates one canonical ID', async () => {
  const h = setup()
  const pending = h.paste.resolve(h.input, h.context)
  const reader = h.readers[0]
  const late = reader.onload
  const result = await observeCompletion(pending, () => reader.complete())
  assert.equal(result.status, 'fulfilled')
  assert.equal(h.generatedIds, 1)
  assert.equal(getEventListeners(h.controller.signal, 'abort').length, 0)
  assert.deepEqual([reader.onload, reader.onerror, reader.onabort], [null, null, null])
  reader.result = 'data:image/png;base64,Aw=='
  late?.()
  assert.equal(h.generatedIds, 1)
})
