import { createLinkPreviewPlugin } from '../../../plugins/link-preview/index.js'
import { assert, blockElement, equal, make, pause, test } from './harness.js'

const initialUrl = 'https://example.test/alpha'
const replacementUrl = 'https://example.test/bravo'

function fixture(onFirstAbort) {
  const requests = []
  const definition = createLinkPreviewPlugin({
    injectStyles: false,
    fetchMeta(url, { signal }) {
      let resolve
      const promise = new Promise(finish => { resolve = finish })
      requests.push({ url, signal, resolve })
      if (requests.length === 1 && onFirstAbort) {
        signal.addEventListener('abort', onFirstAbort, { once: true })
      }
      return promise
    },
  })
  const data = {
    ...definition.schema.createDefault(), url: initialUrl,
    title: 'Loaded title', description: 'Loaded description', domain: 'example.test',
  }
  const editor = make([{ id: 'link', type: 'linkPreview', dataVersion: 1, data }], {
    plugins: [definition], defaultBlock: 'linkPreview', inlineTools: [],
  })
  const input = blockElement(editor, 'link').querySelector('.oe-lp__url-input')
  assert(input instanceof HTMLInputElement)
  const submit = url => {
    input.focus()
    input.value = url
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', bubbles: true, cancelable: true,
    }))
  }
  return { editor, input, requests, submit, before: editor.save().blocks }
}

for (const target of [initialUrl, replacementUrl]) {
  test(`LinkPreview abort observer owns its newer metadata request for ${target === initialUrl ? 'the same' : 'another'} URL`, async () => {
    let h
    h = fixture(() => h.submit(target))
    h.submit(initialUrl)
    equal(h.requests.map(request => request.url), [initialUrl])
    h.submit(initialUrl)
    equal(h.requests.map(request => request.url), [initialUrl, target],
      'The superseded outer refresh may not start another provider request')
    assert(h.requests[0].signal.aborted, 'The original request remains live')
    assert(!h.requests[1].signal.aborted, 'The abort observer successor was canceled')
    const beforeCompletion = h.editor.save().blocks

    h.requests[0].resolve({ title: 'Obsolete title', description: 'Obsolete description' })
    await pause()
    equal(h.editor.save().blocks, beforeCompletion, 'An old response changed the successor document')
    h.requests[1].resolve({ title: 'Newest title', description: 'Newest description' })
    await pause()
    const expected = [{ ...beforeCompletion[0], data: {
      ...beforeCompletion[0].data, title: 'Newest title', description: 'Newest description',
    } }]
    equal(h.editor.save().blocks, expected, 'The newer request lost its completion rights')
    equal(blockElement(h.editor, 'link').querySelector('.oe-lp__title').textContent, 'Newest title')
    equal(h.input.value, target)
    assert(h.editor.undo(), 'The accepted successor was not undoable')
    equal(h.editor.save().blocks, h.before, 'The successor did not retain its one-action history')
    assert(!h.editor.canUndo && h.editor.canRedo, 'Cancellation added an extra history action')
    assert(h.editor.redo())
    equal(h.editor.save().blocks, expected)
    await pause()
    equal(h.requests.map(request => request.url), [initialUrl, target], 'Replay started another request')
  })
}

test('LinkPreview repeated explicit refresh still accepts its latest response without an abort observer', async () => {
  const h = fixture()
  h.submit(initialUrl)
  h.submit(initialUrl)
  equal(h.requests.map(request => request.url), [initialUrl, initialUrl])
  assert(h.requests[0].signal.aborted && !h.requests[1].signal.aborted)
  h.requests[1].resolve({ title: 'Refreshed title' })
  await pause()
  const expected = [{ ...h.before[0], data: { ...h.before[0].data, title: 'Refreshed title' } }]
  equal(h.editor.save().blocks, expected)
  h.requests[0].resolve({ title: 'Obsolete title' })
  await pause()
  equal(h.editor.save().blocks, expected)
  assert(h.editor.undo())
  equal(h.editor.save().blocks, h.before)
  assert(!h.editor.canUndo && h.editor.canRedo)
  assert(h.editor.redo())
  equal(h.editor.save().blocks, expected)
})

test('LinkPreview mode round trip during cancellation retires the old refresh and permits a later submission', async () => {
  let h
  h = fixture(() => {
    h.editor.setReadOnly(true)
    h.editor.setReadOnly(false)
  })
  h.submit(initialUrl)
  h.submit(initialUrl)
  equal(h.requests.map(request => request.url), [initialUrl],
    'The retired refresh restarted metadata after a mode round trip')
  assert(h.requests[0].signal.aborted)
  equal(h.editor.readOnly, false)
  equal(h.editor.save().blocks, h.before)
  assert(!h.editor.canUndo && !h.editor.canRedo)
  h.requests[0].resolve({ title: 'Obsolete title' })
  await pause()
  equal(h.editor.save().blocks, h.before)

  h.submit(initialUrl)
  equal(h.requests.map(request => request.url), [initialUrl, initialUrl])
  h.requests[1].resolve({ title: 'Fresh after mode transition' })
  await pause()
  equal(h.editor.save().blocks[0].data.title, 'Fresh after mode transition')
  assert(h.editor.undo())
  equal(h.editor.save().blocks, h.before)
  assert(!h.editor.canUndo)
})
