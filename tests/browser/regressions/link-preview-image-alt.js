import { createLinkPreviewPlugin } from '../../../plugins/link-preview/index.js'
import { EditorRenderer } from '../../../renderer/index.js'
import { assert, blockElement, equal, make, pause, test } from './harness.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const literalTitle = 'Literal <b>headline</b> &amp; & {{literal}} "quoted"'
const initialData = title => ({
  url: 'https://example.test/story', title, description: 'Plain <i>description</i> &amp;',
  image: pixel, favicon: pixel, domain: 'display.example', template: 'horizontal',
})
const record = data => ({ id: 'link', type: 'linkPreview', dataVersion: 1, data })

function fixture(data, config = {}) {
  const editor = make([record(data)], {
    plugins: [createLinkPreviewPlugin({ injectStyles: false, ...config })],
    defaultBlock: 'linkPreview', inlineTools: [],
  })
  const renderer = new EditorRenderer({ blockTypes: ['linkPreview'], injectStyles: false })
  const root = blockElement(editor, 'link'), image = root.querySelector('.oe-lp__image img')
  const input = root.querySelector('.oe-lp__url-input'), transactions = []
  editor.on('transaction:committed', event => transactions.push(event))
  const check = expected => {
    equal(editor.save().blocks, [record(expected)], 'Alternative text must not change canonical plain metadata')
    assert(blockElement(editor, 'link') === root && root.querySelector('.oe-lp__image img') === image)
    assert(root.querySelector('.oe-lp__url-input') === input, 'Metadata projection must retain the URL control')
    equal(root.querySelector('.oe-lp__title').textContent, expected.title || expected.url)
    equal(root.querySelector('.oe-lp__title').childElementCount, 0, 'The title is literal metadata, not author HTML')
    equal([...root.querySelectorAll('.oe-lp__favicon,.oe-lp__favicon-large,.oe-lp__url-icon img')].map(element => element.alt), ['', '', ''],
      'Decorative favicons must keep empty alternatives')
    const rendered = renderer.renderBlock(editor.save().blocks[0])
    equal(rendered.querySelector('.editor-link-preview__title').textContent, expected.title || expected.url)
    equal(rendered.querySelector('.editor-link-preview__title').childElementCount, 0)
    const renderedImage = rendered.querySelector('.editor-link-preview__image img')
    if (expected.image) {
      equal(renderedImage?.alt, expected.title, 'The public renderer is an independent image-alternative control')
    } else equal(renderedImage, null)
    equal(image.getAttribute('src'), expected.image || null)
    equal(image.alt, expected.title, 'The editor image must expose the same canonical plain title')
  }
  return { editor, transactions, check, dispose() { renderer.destroy(); editor.destroy() } }
}

for (const title of ['', literalTitle]) test(`LinkPreview image alternatives retain ${title ? 'literal title characters' : 'an empty title'} across read-only modes`, () => {
  const data = initialData(title), h = fixture(data)
  try {
    h.check(data)
    for (const mode of [true, false]) {
      h.editor.setReadOnly(mode)
      h.check(data)
      equal(h.editor.readOnly, mode)
    }
    equal(h.transactions.length, 0)
    assert(!h.editor.canUndo && !h.editor.canRedo, 'Derived alternatives must not create history')
  } finally { h.dispose() }
})

test('LinkPreview image alternatives follow canonical title replacement, clearing and one Undo/Redo per action', () => {
  const before = initialData(''), after = { ...before, title: literalTitle }, cleared = { ...after, title: '' }
  const h = fixture(before)
  try {
    h.check(before)
    h.editor.blocks.update('link', () => ({ data: after }))
    h.check(after)
    equal(h.transactions.length, 1)
    assert(h.editor.undo()); h.check(before)
    assert(!h.editor.canUndo && h.editor.canRedo)
    assert(h.editor.redo()); h.check(after)
    h.editor.blocks.update('link', () => ({ data: cleared }))
    h.check(cleared)
    assert(h.editor.undo()); h.check(after)
    assert(h.editor.redo()); h.check(cleared)
    equal(h.transactions.length, 6, 'Alternative projection must not add a transaction to either title edit or replay')
  } finally { h.dispose() }
})

test('LinkPreview image alternatives follow real metadata task completion and replay without another provider request', async () => {
  const before = { ...initialData(''), image: '', favicon: '' }, requests = []
  let resolveMetadata
  const h = fixture(before, { fetchMeta(url, { signal }) {
    requests.push({ url, signal })
    return new Promise(resolve => { resolveMetadata = resolve })
  } })
  try {
    h.check(before)
    await pause()
    equal(requests.map(request => request.url), [before.url])
    assert(requests[0].signal instanceof AbortSignal && !requests[0].signal.aborted)
    assert(typeof resolveMetadata === 'function')
    resolveMetadata({ title: literalTitle, image: pixel, favicon: pixel })
    await pause()
    const after = { ...before, title: literalTitle, image: pixel, favicon: pixel }
    h.check(after)
    equal(h.transactions.length, 1)
    assert(h.editor.undo()); h.check(before)
    assert(!h.editor.canUndo && h.editor.canRedo)
    assert(h.editor.redo()); h.check(after)
    await pause()
    equal(requests.map(request => request.url), [before.url])
    equal(h.transactions.length, 3, 'Metadata replay must keep the original single history action')
  } finally { h.dispose() }
})
