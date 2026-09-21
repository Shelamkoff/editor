import { Person } from '../../../plugins/person/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, equal, assert, pause } from './harness.js'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='
const person = () => ({ id: 'person', type: 'person', data: { persons: [
  { avatar: '', name: 'Example', role: '', bio: '', links: [] },
] } })
const file = () => new File([Uint8Array.from(atob(png), char => char.charCodeAt(0))], 'photo.png', { type: 'image/png' })
const avatar = editor => editor.save().blocks[0].data.persons[0].avatar

function chooseAvatar(editor) {
  let input
  const original = HTMLInputElement.prototype.click
  // Only the native OS chooser is replaced; the actual input/change handler,
  // File, reader, upload pipeline, editor commands and history remain real.
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') input = this
    else original.call(this)
  }
  try { editor.rootElement.querySelector('.oe-person__avatar-upload').click() }
  finally { HTMLInputElement.prototype.click = original }
  assert(input, 'avatar action did not open its file chooser')
  const transfer = new DataTransfer()
  transfer.items.add(file())
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function until(check) {
  const deadline = performance.now() + 1000
  while (!check() && performance.now() < deadline) await pause(10)
}

export function register(enforced = false) {
  if (!enforced) {
    test('Person avatar action still opens the cropper without Trusted Types enforcement', async () => {
      let uploads = 0
      const editor = make([person()], { plugins: [new Paragraph(), new Person({ uploadFile: async () => {
        uploads++; return { url: 'https://example.test/photo.png' }
      } })] })
      chooseAvatar(editor)
      const cancel = document.querySelector('.oe-cropper-btn--cancel')
      assert(cancel, 'ordinary avatar upload lost its interactive cropper')
      cancel.click()
      await pause(20)
      equal(uploads, 0)
      equal(avatar(editor), '')
      equal(document.querySelectorAll('.oe-cropper-overlay').length, 0)
    })
    return
  }

  test('avatar CSP test page enforces TrustedHTML without a permissive default policy', () => {
    let blocked = false
    try { document.createElement('div').innerHTML = '<b>unsafe string</b>' }
    catch (error) { blocked = error instanceof TypeError }
    assert(blocked, 'test page is not enforcing Trusted Types')
    equal(window.trustedTypes.defaultPolicy, null)
  })

  for (const mode of ['local', 'remote']) {
    test(`Person ${mode} avatar upload works under Trusted Types and remains undoable`, async () => {
      let uploaded
      const editor = make([person()], { plugins: [new Paragraph(), new Person(mode === 'remote'
        ? { uploadFile: async value => { uploaded = value; return { url: 'https://example.test/photo.png' } } }
        : {})] })
      chooseAvatar(editor)
      await until(() => avatar(editor) !== '')
      const expected = mode === 'remote' ? 'https://example.test/photo.png' : `data:image/png;base64,${png}`
      equal(avatar(editor), expected)
      equal(document.querySelectorAll('.oe-cropper-overlay').length, 0, 'incompatible cropper was mounted')
      if (mode === 'remote') {
        equal(uploaded.name, 'photo.png')
        equal(uploaded.type, 'image/png')
        equal(new Uint8Array(await uploaded.arrayBuffer()), Uint8Array.from(atob(png), char => char.charCodeAt(0)))
      }
      editor.undo(); equal(avatar(editor), '')
      editor.redo(); equal(avatar(editor), expected)
    })
  }

  test('Person pending avatar upload under Trusted Types cannot change replacement data', async () => {
    let finish, signal
    const editor = make([person()], { plugins: [new Paragraph(), new Person({ uploadFile: (_file, context) => {
      signal = context.signal; return new Promise(resolve => { finish = resolve })
    } })] })
    chooseAvatar(editor)
    await until(() => !!finish)
    assert(finish, 'upload did not reach the consumer')
    editor.render({ blocks: [person()] })
    assert(signal.aborted, 'replacement did not cancel the previous avatar operation')
    finish({ url: 'https://example.test/stale.png' })
    await pause(20)
    equal(avatar(editor), '')
  })
}
