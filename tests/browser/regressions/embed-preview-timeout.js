import { Embed } from '../../../plugins/embed/index.js'
import { test, make, equal, assert, pause } from './harness.js'

const block = videoId => ({ id: 'video', type: 'embed', data: { service: 'vimeo', videoId } })
const preview = editor => editor.rootElement.querySelector('.oe-embed__preview')?.getAttribute('src') ?? null
async function until(predicate) {
  const deadline = performance.now() + 1500
  while (!predicate() && performance.now() < deadline) await pause(5)
  assert(predicate(), 'expected preview request state was not reached')
}

export function register() {
  test('Embed rejects a provider preview resolved after its timeout even when the adapter ignores abort', async () => {
    let signal, finish
    const editor = make([block('12345')], { plugins: [new Embed({
      previewTimeoutMs: 0,
      resolvePreview: request => { signal = request.signal; return new Promise(resolve => { finish = resolve }) },
    })] })
    const before = editor.save().blocks
    assert(finish, 'the configured adapter must be called')
    await until(() => signal.aborted)
    equal(signal.reason.name, 'TimeoutError')
    finish({ thumbnailUrl: 'https://example.test/late.png', title: 'Too late' })
    await pause(10)
    equal(preview(editor), null, 'timed-out work must not replace the current placeholder')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })

  test('Embed accepts a provider preview that resolves before timeout without modifying document history', async () => {
    const editor = make([block('12345')], { plugins: [new Embed({
      resolvePreview: async () => ({ thumbnailUrl: 'https://example.test/timely.png', title: 'Preview' }),
    })] })
    const before = editor.save().blocks
    await until(() => preview(editor) !== null)
    equal(preview(editor), 'https://example.test/timely.png')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })

  test('Embed replacement aborts its old preview and rejects late adapter output', async () => {
    const pending = []
    const editor = make([block('12345')], { plugins: [new Embed({
      resolvePreview: request => new Promise(resolve => { pending.push({ request, resolve }) }),
    })] })
    editor.render({ blocks: [block('67890')] })
    equal(pending.length, 2)
    assert(pending[0].request.signal.aborted)
    pending[1].resolve({ thumbnailUrl: 'https://example.test/new.png' })
    await until(() => preview(editor) !== null)
    pending[0].resolve({ thumbnailUrl: 'https://example.test/old.png' })
    await pause(10)
    equal(preview(editor), 'https://example.test/new.png')
  })
}
