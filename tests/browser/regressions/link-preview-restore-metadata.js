import { LinkPreview } from '../../../plugins/link-preview/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, equal, assert, pause, key } from './harness.js'

async function until(predicate, message) {
  const deadline = performance.now() + 1500
  while (!predicate() && performance.now() < deadline) await pause(5)
  assert(predicate(), message)
}
function submit(editor, url) {
  const input = editor.rootElement.querySelector('.oe-lp__url-input')
  input.value = url
  key(input, 'Enter')
}
export function register() {
  test('a failed automatic metadata update does not start a rollback request loop', async () => {
    let requests = 0, rejected = 0
    class ValidatingPreview extends LinkPreview {
      validate(data) { if (data.title) { rejected++; return false }; return true }
    }
    const editor = make([{ id:'l', type:'linkPreview', data:{ url:'https://example.test/article' } }], {
      plugins: [new Paragraph(), new ValidatingPreview({ fetchMeta: async () => {
        requests++
        // Bound the broken implementation so the test reports the loop instead
        // of starving the browser's event loop forever.
        if (requests > 3) return new Promise(() => {})
        return { title: 'Rejected title' }
      } })], validationMode: 'strict',
    })
    const before = editor.save().blocks
    await until(() => rejected > 0, 'automatic result was never applied')
    await pause(15)
    equal(requests, 1, 'restoring the pre-command snapshot must not refetch rejected metadata')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })

  test('Undo of automatic metadata enrichment is not reversed by another automatic fetch', async () => {
    let requests = 0
    const editor = make([{ id:'l', type:'linkPreview', data:{ url:'https://example.test/article' } }], {
      plugins: [new Paragraph(), new LinkPreview({ fetchMeta: async () => { requests++; return { title: 'Article' } } })],
    })
    const before = editor.save().blocks
    await until(() => editor.save().blocks[0].data.title === 'Article', 'automatic metadata was not loaded')
    const enriched = editor.save().blocks
    editor.undo()
    await pause(20)
    equal(editor.save().blocks, before, 'Undo must remain effective after asynchronous work settles')
    equal(requests, 1)
    equal(editor.canRedo, true)
    editor.redo()
    await pause(10)
    equal(editor.save().blocks, enriched)
    editor.undo()
    submit(editor, 'https://example.test/other')
    await until(() => editor.save().blocks[0].data.url === 'https://example.test/other', 'restored controls must remain editable')
    equal(requests, 2, 'an explicit user action must still request metadata')
  })

}
