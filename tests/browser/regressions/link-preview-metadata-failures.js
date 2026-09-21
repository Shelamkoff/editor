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
  for (const fetchMetadata of [false, true]) {
    test(`link preview URL application failure is observed (metadata=${fetchMetadata})`, async () => {
      let rejected = 0, allow = false
      class ValidatingPreview extends LinkPreview {
        validate(data) {
          if (data.url && !allow) { rejected++; return false }
          return true
        }
      }
      const editor = make([{ id: 'l', type: 'linkPreview', data: {} }], {
        plugins: [new Paragraph(), new ValidatingPreview(fetchMetadata
          ? { fetchMeta: async () => ({ title: 'Article' }) } : {})], validationMode: 'strict',
      })
      const before = editor.save().blocks
      submit(editor, 'https://example.test/article')
      await until(() => rejected > 0, 'metadata never reached validation')
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      await pause(10) // the harness also rejects unhandled Promise errors
      allow = true
      submit(editor, 'https://example.test/article')
      await until(() => !!editor.save().blocks[0].data.url, 'valid retry never committed')
      const after = editor.save().blocks
      editor.undo()
      await pause(10)
      equal(editor.save().blocks, before)
      editor.redo()
      await pause(10)
      equal(editor.save().blocks, after)
    })
  }

  test('replacing a link preview cancels metadata and rejects its stale result', async () => {
    let resolve, signal
    const editor = make([{ id:'l',type:'linkPreview',data:{} }], {
      plugins:[new Paragraph(),new LinkPreview({ fetchMeta: (_url, context) => {
        signal = context.signal
        return new Promise(done => { resolve = done })
      } })],
    })
    submit(editor, 'https://example.test/article')
    assert(resolve)
    editor.clear()
    const replacement = editor.save().blocks
    assert(signal.aborted)
    resolve({ title:'Stale' })
    await pause(15)
    equal(editor.save().blocks,replacement)
  })
}
