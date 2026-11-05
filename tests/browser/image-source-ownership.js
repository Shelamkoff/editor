import { createImagePlugin } from '../../plugins/image/index.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { test, assert, equal, make, editorHolder, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey } from './native-input-helpers.js'

const native = location.pathname.includes('/native-')
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const chosen = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const click = async element => {
  assert(element, 'Expected a real Image control')
  if (native) await clickNative(element)
  else { element.click(); await pause() }
}

if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
  test('Image source ownership enforces Trusted Types', () => {
    let denied = false
    try { document.createElement('div').innerHTML = '<b>untrusted</b>' }
    catch (error) { denied = error instanceof TypeError }
    assert(denied)
  })
}

function fixture(source, populated) {
  const requests = [], transactions = []
  const request = ({ signal }) => new Promise((resolve, reject) => requests.push({ signal, resolve, reject }))
  const definition = createImagePlugin({
    ...(source === 'upload' ? { uploadFile: (_file, context) => request(context) } : {}),
    actions: [{ label: 'Library', handler: request }],
  })
  const initial = { id: 'image', type: 'image', dataVersion: 1, data: {
    ...definition.schema.createDefault(),
    ...(populated ? { file: { url: pixel, width: 1, height: 1 }, caption: '<b>Keep</b> {{swatch}}',
      styles: { width: '180px', borderRadius: '7px' } } : {}),
  }, ...(populated ? { inline: { swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } } : {}) }
  const untouched = structuredClone(initial)
  const editor = make([initial], { plugins: [definition], defaultBlock: 'image', inlineTools: [],
    inlinePlugins: [createColorSwatchPlugin()] })
  const holder = editorHolder(editor)
  const wrapper = () => holder.querySelector('.oe-image')
  const button = label => [...wrapper().querySelectorAll('button')]
    .find(element => element.textContent.trim() === label && element.checkVisibility())
  editor.on('transaction:committed', event => transactions.push(event))
  return { editor, requests, transactions, wrapper, button,
    checkCaller: () => equal(initial, untouched, 'Caller data must remain unchanged'),
    async start() {
      if (source === 'upload') {
        // Controlled file delivery; this does not claim a native file-picker gesture.
        const transfer = new DataTransfer()
        transfer.items.add(new File(['image'], 'source.png', { type: 'image/png' }))
        wrapper().dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
      } else {
        if (editor.save().blocks[0].data.file.url) await click(button('Replace'))
        await click(button('Library'))
      }
      await pause()
      assert(requests.length > 0, 'The actual source callback must start')
      assert(wrapper().classList.contains('oe-image--loading'), 'Pending source must show loading')
      return requests.at(-1)
    },
    async submitUrl() {
      if (editor.save().blocks[0].data.file.url) await click(button('Replace'))
      await click(button(editor.save().blocks[0].data.file.url ? 'URL' : 'Insert by URL'))
      const surface = wrapper().querySelector('.oe-source-editor:not(.oe-source-editor--preloaded)')
      assert(surface, 'The real URL source editor must open')
      const input = surface.querySelector('input')
      if (native) {
        await click(input)
        await window.__testInput('Input.insertText', { text: chosen })
        await dispatchKey('Enter', 'Enter', 13)
      } else {
        input.value = chosen
        input.dispatchEvent(new Event('input', { bubbles: true }))
        surface.querySelector('form').requestSubmit()
        await pause()
      }
    },
    async history(direction) {
      wrapper().focus()
      if (native) await dispatchKey('z', 'KeyZ', 90, direction === 'undo' ? 2 : 10)
      else editor[direction]()
      await pause()
    },
  }
}

for (const source of ['action', 'upload']) for (const populated of [false, true]) {
  for (const outcome of ['resolve', 'reject']) test(`Image URL retires ${source}, populated=${populated}, late ${outcome}`, async () => {
    const h = fixture(source, populated)
    const before = h.editor.save().blocks
    const pending = await h.start()
    await h.submitUrl()
    const expected = structuredClone(before)
    expected[0].data.file = { url: chosen }
    equal(h.editor.save().blocks, expected, 'URL replacement must preserve caption, sidecar and appearance')
    const retired = pending.signal.aborted
    const stoppedLoading = !h.wrapper().classList.contains('oe-image--loading')
    if (outcome === 'resolve') pending.resolve({ url: pixel, alt: 'Stale' })
    else pending.reject(new Error('Retired source failure'))
    await pause(30)
    equal(h.editor.save().blocks, expected, 'Late source must not overwrite a newer explicit URL')
    assert(retired, 'URL submission must abort the superseded source immediately')
    assert(stoppedLoading, 'URL submission must retire the loading indicator immediately')
    equal(h.transactions.length, 1, 'Only URL replacement creates an action')
    await h.history('undo')
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.editor.canRedo, 'One Undo must restore the exact predecessor')
    await h.history('redo')
    equal(h.editor.save().blocks, expected)
    assert(h.editor.canUndo && !h.editor.canRedo)
    equal(h.transactions.length, 3)
    h.checkCaller()
  })

  test(`Image read-only retires ${source} loading immediately, populated=${populated}`, async () => {
    const h = fixture(source, populated)
    const before = h.editor.save().blocks
    const retired = await h.start()
    h.editor.setReadOnly(true)
    assert(retired.signal.aborted, 'Read-only must revoke the pending source')
    const stoppedLoading = !h.wrapper().classList.contains('oe-image--loading')
    h.editor.setReadOnly(false)
    const current = await h.start()
    retired.resolve({ url: pixel, alt: 'Retired' })
    await pause(30)
    equal(h.editor.save().blocks, before, 'Late retired work must not mutate the source')
    assert(h.wrapper().classList.contains('oe-image--loading'), 'Old completion must not hide successor loading')
    assert(!current.signal.aborted, 'Successor source must remain live')
    current.resolve({ url: chosen, alt: 'Fresh' })
    await pause(30)
    const expected = structuredClone(before)
    expected[0].data.file = { url: chosen }
    if (!populated) expected[0].data.caption = 'Fresh'
    equal(h.editor.save().blocks, expected, 'Current source must still commit normally')
    assert(!h.wrapper().classList.contains('oe-image--loading'), 'Completed current source must settle loading')
    equal(h.transactions.length, 1)
    assert(stoppedLoading, 'Read-only must settle cancelled loading before the provider responds')
    await h.history('undo')
    equal(h.editor.save().blocks, before)
    await h.history('redo')
    equal(h.editor.save().blocks, expected)
    h.checkCaller()
  })
}

await run()
