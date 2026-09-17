import { createEditor, sanitizeHtml } from '../../core/index.js'
import { Heading, Paragraph, Raw } from '../../plugins/index.js'
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
    plugins: [new Paragraph(), new Heading()],
    defaultBlock: 'paragraph',
    inlineTools: [],
    injectStyles: false,
    data: {
      version: '1.0',
      blocks: [
        { id: 'p', type: 'paragraph', data: { text: '<strong>Safe</strong><img src=x onerror=bad()>' } },
        { id: 'h', type: 'heading', data: { text: '<em>Heading</em><script>bad()</script>', level: 2 } },
      ],
    },
  })
  try {
    const saved = editor.save()
    assert(saved.blocks[0].data.text === '<strong>Safe</strong>', 'paragraph sanitizer did not preserve the expected safe subset')
    assert(saved.blocks[1].data.text === '<em>Heading</em>bad()', 'heading sanitizer did not preserve text from an unsupported element')
    editor.blocks.convert(0, 'heading', { level: 3 })
    assert(editor.blocks.getBlockByIndex(0).type === 'heading', 'programmatic conversion failed under Trusted Types')
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
      version: '1.0',
      blocks: [
        { id: 'p', type: 'paragraph', data: { text: '<strong>Rendered</strong><img src=x onerror=bad()>' } },
        { id: 'h', type: 'heading', data: { text: '<em>Title</em>', level: 2 } },
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

await test('Raw preview assigns TrustedHTML under require-trusted-types-for', async () => {
  const raw = new Raw()
  let wrapper = null
  try {
    wrapper = raw.render(
      { html: '<p style="color:red" onclick="bad()">safe</p><script>bad()</script>' },
      {
        ownerDocument: document,
        readOnly: true,
        mutate(fn) { return fn() },
      },
    )
    document.body.appendChild(wrapper)
    const frame = wrapper.querySelector('iframe')
    assert(frame, 'Raw preview iframe missing')
    assert(frame.srcdoc.includes('safe'), 'safe Raw content missing from preview')
    assert(!/onclick|<script/i.test(frame.srcdoc), 'unsafe Raw content survived preview sanitization')
  } finally {
    if (wrapper) {
      raw.destroy(wrapper)
      wrapper.remove()
    }
  }
})

const failed = results.filter(result => result.status !== 'PASS')
document.querySelector('#result').textContent = JSON.stringify(results, null, 2)
document.body.dataset.status = failed.length ? 'fail' : 'pass'
