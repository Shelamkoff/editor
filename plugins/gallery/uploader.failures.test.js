import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { GalleryUploader } from './uploader.js'
import { controlledFileReader, observeCompletion } from '../../tests/helpers/controlledFileReader.js'

for (const mode of ['local', 'remote']) {
  test(`GalleryUploader ${mode} delivers application failures through its Promise`, async () => {
    const { readers, document, file, controller } = controlledFileReader()
    const failure = new Error('mutation checkpoint failed')
    const uploader = new GalleryUploader(mode === 'remote'
      ? { uploadFile: async () => ({ url: 'https://example.test/pixel.png' }) } : {})
    const pending = uploader.handle([file], () => { throw failure }, controller.signal, document)
    const actual = await observeCompletion(pending, () => readers[0]?.complete())
    assert.deepEqual(actual, { status: 'rejected', rejection: failure, eventError: undefined })
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  })
}

test('GalleryUploader local rejection releases readers and a new batch still works', async () => {
  const { readers, document, file, controller } = controlledFileReader()
  const uploader = new GalleryUploader({})
  let calls = 0
  const pending = uploader.handle([file, file], () => { calls++; throw new Error('apply failed') }, controller.signal, document)
  readers[1].complete()
  const actual = await observeCompletion(pending, () => readers[0].complete())
  assert.equal(actual.status, 'rejected')
  assert.equal(actual.eventError, undefined)
  assert.equal(calls, 1)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  for (const reader of readers) assert.deepEqual([reader.onload, reader.onerror, reader.onabort], [null, null, null])
  const recovery = uploader.handle([file], () => { calls++ }, controller.signal, document)
  readers[2].complete()
  await recovery
  assert.equal(calls, 2)
})

test('GalleryUploader local success retains input order and skips failed readers', async () => {
  const { readers, document, file, controller } = controlledFileReader()
  let added
  const pending = new GalleryUploader({}).handle([file, file, file], value => { added = value }, controller.signal, document)
  readers[2].complete('data:image/png;base64,Aw==')
  readers[1].onerror()
  readers[0].complete('data:image/png;base64,AQ==')
  await pending
  assert.deepEqual(added, [{ url: 'data:image/png;base64,AQ==', caption: '' }, { url: 'data:image/png;base64,Aw==', caption: '' }])
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
})

test('GalleryUploader abort settles the batch without applying partial results', async () => {
  const { readers, document, file, controller } = controlledFileReader()
  let calls = 0
  const pending = new GalleryUploader({}).handle([file, file], () => { calls++ }, controller.signal, document)
  readers[0].complete()
  controller.abort()
  await pending
  assert.equal(calls, 0)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
})

test('GalleryUploader ignores duplicate completion callbacks', async () => {
  const { readers, document, file } = controlledFileReader()
  let calls = 0
  const pending = new GalleryUploader({}).handle([file], () => { calls++ }, undefined, document)
  const late = readers[0].onload
  readers[0].complete()
  await pending
  late()
  assert.equal(calls, 1)
})

test('GalleryUploader empty and already cancelled batches create no readers', async () => {
  const { readers, document, file, controller } = controlledFileReader()
  const uploader = new GalleryUploader({})
  const unexpected = () => assert.fail('no results should be applied')
  await uploader.handle([], unexpected, undefined, document)
  controller.abort()
  await uploader.handle([file], unexpected, controller.signal, document)
  assert.equal(readers.length, 0)
})

test('GalleryUploader aborted batch settles when a FileReader omits its abort event', async () => {
  const { readers, document, file, controller } = controlledFileReader()
  const uploader = new GalleryUploader({})
  let applied = 0
  const pending = uploader.handle([file, file], () => { applied++ }, controller.signal, document)
  readers[0].complete()
  let aborted = 0
  readers[1].abort = () => { aborted++ }
  const stale = readers[1].onload
  const actual = await observeCompletion(pending, () => controller.abort())
  assert.deepEqual(actual, { status: 'fulfilled', rejection: undefined, eventError: undefined },
    'aborted gallery batch hung when the final reader omitted onabort')
  assert.equal(aborted, 1)
  assert.equal(applied, 0, 'completed files must not be committed after cancellation')
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  for (const reader of readers) assert.deepEqual([reader.onload, reader.onerror, reader.onabort], [null, null, null])
  stale?.()
  assert.equal(applied, 0)
})

test('GalleryUploader releases earlier FileReaders if later construction fails', async () => {
  const { readers, document, file, controller } = controlledFileReader()
  const BaseReader = document.defaultView.FileReader
  let constructed = 0
  document.defaultView.FileReader = class extends BaseReader {
    constructor() {
      if (++constructed === 2) throw new Error('FileReader constructor failure')
      super()
    }
  }
  let applied = 0
  const uploader = new GalleryUploader({})
  const outcome = await observeCompletion(
    uploader.handle([file, file], () => { applied++ }, controller.signal, document),
    () => {},
  )
  assert.equal(outcome.status, 'rejected')
  assert.match(outcome.rejection?.message ?? '', /FileReader constructor failure/)
  assert.equal(applied, 0)
  assert.equal(readers.length, 1)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0,
    'failed gallery setup leaked a live FileReader through AbortSignal')
  assert.deepEqual([readers[0].onload, readers[0].onerror, readers[0].onabort], [null, null, null])
})

test('GalleryUploader does not construct the rest of a batch after synchronous owner cancellation', async () => {
  const { readers, document, file, controller } = controlledFileReader()
  const BaseReader = document.defaultView.FileReader
  document.defaultView.FileReader = class extends BaseReader {
    constructor() {
      super()
      if (readers.length === 1) controller.abort()
    }
  }
  let committed = 0
  const result = await observeCompletion(
    new GalleryUploader({}).handle([file, file, file], () => { committed++ }, controller.signal, document),
    () => {},
  )
  assert.deepEqual(result, { status: 'fulfilled', rejection: undefined, eventError: undefined })
  assert.equal(readers.length, 1, 'canceled batch kept constructing readers for remaining files')
  assert.equal(committed, 0)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  assert.deepEqual([readers[0].onload, readers[0].onerror, readers[0].onabort], [null, null, null])
})
