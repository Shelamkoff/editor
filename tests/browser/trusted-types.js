import { createEditor } from '../../core/index.js'
import { sanitizeHtml } from '../../plugin-kit/index.js'
import { createHeadingPlugin, createListPlugin, createParagraphPlugin, createRawPlugin } from '../../plugins/index.js'
import { createEditorRenderer } from '../../renderer/index.js'

const results = []
function assert(value, message) { if (!value) throw new Error(message) }
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }) }
  catch (error) { results.push({ name, status: 'FAIL', error: error?.stack ?? String(error) }) }
}

await test('inline sanitizer remains a string API under Trusted Types enforcement', () => {
  assert(typeof /** @type {any} */ (globalThis).trustedTypes === 'object', 'Trusted Types API unavailable under the test browser')
  const safe = sanitizeHtml('<strong>safe</strong><img src=x onerror=bad()>')
  assert(typeof safe === 'string', 'sanitizeHtml changed its public string contract')
  assert(safe === '<strong>safe</strong>', `unexpected sanitized HTML: ${safe}`)
})

await test('editor text blocks render under require-trusted-types-for', () => {
  const holder = document.createElement('section')
  document.querySelector('#sandbox').appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [createParagraphPlugin({ injectStyles: false }), createHeadingPlugin({ injectStyles: false })],
    defaultBlock: 'paragraph',
    inlineTools: [],
    injectStyles: false,
    data: {
      version: '2.0.0',
      blocks: [
        { id: 'p', type: 'paragraph', dataVersion: 2, data: { text: '<strong>Safe</strong><img src=x onerror=bad()>' } },
        { id: 'h', type: 'heading', dataVersion: 2, data: { text: '<em>Heading</em><script>bad()</script>', level: 2 } },
      ],
    },
  })
  try {
    const saved = editor.save()
    assert(saved.blocks[0].data.text === '<b>Safe</b>', 'paragraph sanitizer did not preserve the expected safe subset')
    assert(saved.blocks[1].data.text === '<i>Heading</i>bad()', 'heading sanitizer did not preserve text from an unsupported element')
    const firstId = editor.blocks.at(0).id
    editor.blocks.convert(firstId, { type: 'heading', toolboxItemId: 'h3' })
    assert(editor.blocks.at(0).type === 'heading', 'programmatic conversion failed under Trusted Types')
  } finally {
    editor.destroy()
    holder.remove()
  }
})

await test('document renderer handles inline HTML under Trusted Types enforcement', () => {
  const renderer = createEditorRenderer({ injectStyles: false, blockTypes: ['paragraph', 'heading'] })
  let root
  try {
    root = renderer.render({
      version: '2.0.0',
      blocks: [
        { id: 'p', type: 'paragraph', dataVersion: 2, data: { text: '<strong>Rendered</strong><img src=x onerror=bad()>' } },
        { id: 'h', type: 'heading', dataVersion: 2, data: { text: '<em>Title</em>', level: 2 } },
      ],
    })
    assert(root.textContent.includes('Rendered'), 'renderer paragraph content missing')
    assert(root.textContent.includes('Title'), 'renderer heading content missing')
    assert(!root.querySelector('img, script'), 'renderer emitted unsafe inline nodes')
  } finally {
    if (root) renderer.destroy(root)
    else renderer.destroy()
  }
})

await test('clipboard HTML import and private copy use TrustedHTML sinks', async () => {
  const holder = document.createElement('section')
  document.querySelector('#sandbox').appendChild(holder)
  const paragraph = createParagraphPlugin({ injectStyles: false })
  const editor = createEditor({
    holder,
    plugins: [paragraph, createHeadingPlugin(), createListPlugin()],
    defaultBlock: 'paragraph',
    inlineTools: [],
    injectStyles: false,
    data: {
      version: '2.0.0',
      blocks: [{
        id: 'clipboard-tt',
        type: 'paragraph',
        dataVersion: paragraph.schema.currentVersion,
        data: { text: '' },
      }],
    },
  })
  try {
    const field = holder.querySelector('.oe-block[data-block-id="clipboard-tt"] [contenteditable="true"]')
    assert(field instanceof HTMLElement, 'clipboard Trusted Types field is missing')
    field.focus()
    const caret = document.createRange()
    caret.selectNodeContents(field)
    caret.collapse(true)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(caret)

    const transfer = new DataTransfer()
    transfer.setData('text/html', '<p><strong>Safe</strong></p><h3>Title</h3><ol><li>One</li></ol>')
    transfer.setData('text/plain', 'fallback')
    const paste = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    })
    field.dispatchEvent(paste)
    await Promise.resolve()
    assert(paste.defaultPrevented, 'structured HTML paste was not owned under Trusted Types')
    const saved = editor.save()
    assert(
      saved.blocks.map(block => block.type).join(',') === 'paragraph,heading,list',
      'structured HTML import failed under Trusted Types',
    )

    const first = holder.querySelector('.oe-block[data-block-id="clipboard-tt"] [contenteditable="true"]')
    assert(first instanceof HTMLElement, 'clipboard copy field disappeared')
    const copyRange = document.createRange()
    copyRange.selectNodeContents(first)
    selection.removeAllRanges()
    selection.addRange(copyRange)
    first.focus()
    document.dispatchEvent(new Event('selectionchange'))

    const copyData = new DataTransfer()
    const copy = new ClipboardEvent('copy', {
      bubbles: true,
      cancelable: true,
      clipboardData: copyData,
    })
    first.dispatchEvent(copy)
    assert(copy.defaultPrevented, 'canonical copy was not handled under Trusted Types')
    const privatePayload = copyData.getData('application/x-rector-fragment')
    assert(privatePayload.includes('"version":2'), 'private clipboard fragment was not produced under Trusted Types')
  } finally {
    editor.destroy()
    holder.remove()
  }
})

await test('Raw preview assigns TrustedHTML under require-trusted-types-for', async () => {
  const holder = document.createElement('section')
  document.querySelector('#sandbox').appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [createRawPlugin({ injectStyles: false })],
    defaultBlock: 'raw',
    injectStyles: false,
    readOnly: true,
    data: {
      version: '2.0.0',
      blocks: [{ id: 'raw', type: 'raw', dataVersion: 1, data: { html: '<p style="color:red" onclick="bad()">safe</p><script>bad()</script>' } }],
    },
  })
  try {
    const frame = holder.querySelector('.oe-raw__preview iframe')
    assert(frame, 'Raw preview iframe missing')
    assert(frame.srcdoc.includes('safe'), 'safe Raw content missing from preview')
    assert(!/onclick|<script/i.test(frame.srcdoc), 'unsafe Raw content survived preview sanitization')
  } finally {
    editor.destroy()
    holder.remove()
  }
})

await test('multiple Rector module instances share one Trusted Types policy per realm', async () => {
  const first = await import('../../shared/sanitize/trustedHtml.js?rector-copy=one')
  const second = await import('../../shared/sanitize/trustedHtml.js?rector-copy=two')
  const firstValue = first.toTrustedHtml('<strong>one</strong>', document)
  const secondValue = second.toTrustedHtml('<strong>two</strong>', document)
  assert(String(firstValue) === '<strong>one</strong>', 'first duplicated module could not use the Rector policy')
  assert(String(secondValue) === '<strong>two</strong>', 'second duplicated module could not reuse the Rector policy')
})

const failed = results.filter(result => result.status !== 'PASS')
document.querySelector('#result').textContent = JSON.stringify(results, null, 2)
document.body.dataset.status = failed.length ? 'fail' : 'pass'
