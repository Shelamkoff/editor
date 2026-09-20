import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { ImageUploader } from './uploader.js'
import { controlledFileReader, observeCompletion } from '../../tests/helpers/controlledFileReader.js'

for (const mode of ['local', 'remote']) {
  test(`ImageUploader ${mode} contains application errors without an uncaught event`, async () => {
    const { readers, document, file, controller } = controlledFileReader()
    const uploader = new ImageUploader(mode === 'remote'
      ? { uploadFile: async () => ({ url: 'https://example.test/pixel.png' }) } : {})
    const pending = uploader.handle(file, () => { throw new Error('mutation failed') }, controller.signal, document)
    assert.deepEqual(await observeCompletion(pending, () => readers[0]?.complete()), {
      status: 'fulfilled', rejection: undefined, eventError: undefined,
    })
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  })
}

test('ImageUploader releases event handlers after completion and does not reapply a queued load', async () => {
  const { readers, document, file, controller } = controlledFileReader()
  let calls = 0
  const pending = new ImageUploader({}).handle(file, () => { calls++ }, controller.signal, document)
  const late = readers[0].onload
  readers[0].complete()
  await pending
  late()
  assert.equal(calls, 1)
  assert.deepEqual([readers[0].onload, readers[0].onerror, readers[0].onabort], [null, null, null])
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
})

test('ImageUploader failure does not prevent a subsequent successful upload', async () => {
  const { readers, document, file } = controlledFileReader()
  const uploader = new ImageUploader({})
  const first = uploader.handle(file, () => { throw new Error('apply failed') }, undefined, document)
  const actual = await observeCompletion(first, () => readers[0].complete())
  assert.equal(actual.eventError, undefined)
  assert.equal(actual.status, 'fulfilled')
  let result
  const second = uploader.handle(file, value => { result = value }, undefined, document)
  readers[1].complete()
  await second
  assert.deepEqual(result, { url: 'data:image/png;base64,AA==' })
})

for (const event of ['abort', 'error']) {
  test(`ImageUploader ${event} completes without applying data or a late load`, async () => {
    const { readers, document, file, controller } = controlledFileReader()
    let calls = 0
    const pending = new ImageUploader({}).handle(file, () => { calls++ }, controller.signal, document)
    const late = readers[0].onload
    if (event === 'abort') controller.abort()
    else readers[0].onerror()
    await pending
    readers[0].result = 'data:image/png;base64,AA=='
    late()
    assert.equal(calls, 0)
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  })
}

test('ImageUploader rejects unsafe URLs without calling the application', async () => {
  const { readers, document, file } = controlledFileReader()
  let calls = 0
  const pending = new ImageUploader({}).handle(file, () => { calls++ }, undefined, document)
  readers[0].complete('javascript:alert(1)')
  await pending
  assert.equal(calls, 0)
})
