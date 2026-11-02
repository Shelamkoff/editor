import { createEditor } from '../../core/index.js'
import { sanitizeHtml } from '../../plugin-kit/index.js'
import { createHeadingPlugin, createListPlugin, createParagraphPlugin, createRawPlugin } from '../../plugins/index.js'
import { EditorRenderer } from '../../renderer/index.js'
import { sanitizeRawHtml, sanitizeRawHtmlForSink, setSanitizedRawHtml } from '../../shared/sanitize/sanitizeRawHtml.js'
import { waitForEmbeddedDocument } from './embedded-html-helpers.js'
import { setSanitizedHtml, insertSanitizedHtml } from '../../plugin-kit/index.js'
import { toTrustedHtml } from '../../shared/sanitize/trustedHtml.js'

const results = []
function assert(value, message) { if (!value) throw new Error(message) }
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }) }
  catch (error) { results.push({ name, status: 'FAIL', error: error?.stack ?? String(error) }) }
}

await test('sanitized template owns inert content and retains author class serialization', () => {
  const template = document.createElement('template')
  setSanitizedHtml(template, '<span class="author-sample">Safe</span><img src=x onerror=bad()>')
  assert(template.childNodes.length === 0, 'Template content was inserted as ordinary children')
  const span = template.content.firstElementChild
  assert(span?.textContent === 'Safe' && template.content.childNodes.length === 1, 'Sanitized template content is missing or unsafe')
  assert(span.getAttribute('class') === 'author-sample' && span.className === '', 'Author class acquired ordinary UI identity')
  assert(template.innerHTML === '<span class="author-sample">Safe</span>', 'Canonical HTML class spelling changed')
})

await test('inline DOM sinks preserve the visible HTML meaning of allowed names from a foreign namespace', () => {
  const html = '<svg><a href="/boundary-destination">Link</a></svg><svg><mark>Mark</mark></svg> tail'
  const canonical = '<a href="/boundary-destination" rel="noopener noreferrer">Link</a><mark>Mark</mark> tail'
  assert(sanitizeHtml(html, document) === canonical, 'Canonical inline HTML changed')
  const reference = document.createElement('div'), replaced = document.createElement('div'), inserted = document.createElement('div'), rendered = document.createElement('div')
  document.querySelector('#sandbox').append(reference, replaced, inserted, rendered)
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
  renderer.registerRenderer({ type: 'namespace-inline', schema: { currentVersion: 1, createDefault: () => ({ html: '' }),
    decode: input => ({ dataVersion: input.dataVersion, data: structuredClone(input.data) }), encode: data => ({ dataVersion: 1, data: structuredClone(data) }) },
    render(block, parse, context) { const root = context.ownerDocument.createElement('div'); root.append(parse(block.data.html)); return root },
  })
  try {
    reference.innerHTML = toTrustedHtml(canonical, document)
    setSanitizedHtml(replaced, html); insertSanitizedHtml(inserted, 'beforeend', html)
    renderer.renderTo({ version: '2.0.0', blocks: [{ id: 'p', type: 'namespace-inline', dataVersion: 1, data: { html } }] }, rendered)
    const meaning = root => [...root.querySelectorAll('a,mark')].map(element => ({ tag: element.localName,
      namespace: element.namespaceURI, text: element.textContent, visible: element.getBoundingClientRect().width > 0,
      href: element.getAttribute('href'), rel: element.getAttribute('rel') }))
    const expected = meaning(reference)
    assert(expected.length === 2 && expected.every(element => element.visible), 'Native HTML control is not visible')
    for (const root of [replaced, inserted, rendered]) assert(JSON.stringify(meaning(root)) === JSON.stringify(expected), 'Live inline tags lost canonical HTML namespace or visible content')
  } finally { renderer.destroy(); for (const root of [reference, replaced, inserted, rendered]) root.remove() }
})

for (const position of ['beforebegin', 'afterbegin', 'beforeend', 'afterend']) await test(`sanitized adjacent insertion retains native ${position} ordering under Trusted Types`, () => {
  const actual = document.createElement('section'), reference = document.createElement('section')
  for (const parent of [actual, reference]) {
    const element = document.createElement('i'); element.textContent = 'middle'; parent.append(element)
  }
  const html = '<span class="author-sample" style="font-size:32.75px">Author</span>'
  reference.firstElementChild.insertAdjacentHTML(position, toTrustedHtml(html, document))
  insertSanitizedHtml(actual.firstElementChild, position, html)
  const meaning = node => [...node.childNodes].map(child => child.nodeType === 3 ? child.textContent : {
    tag: child.localName, class: child.getAttribute('class'), size: child.style.fontSize, children: meaning(child),
  })
  assert(JSON.stringify(meaning(actual)) === JSON.stringify(meaning(reference)), 'Sanitized insertion changed native position or inline meaning')
  assert(actual.querySelector('span').className === '', 'Adjacent author class activated ordinary UI identity')
})

await test('sanitized adjacent insertion retains native invalid-position and missing-parent errors', () => {
  const element = document.createElement('span')
  for (const [position, expected] of [['invalid', 'SyntaxError'], ['beforebegin', 'NoModificationAllowedError'], ['afterend', 'NoModificationAllowedError']]) {
    let actual, reference
    try { element.insertAdjacentHTML(position, toTrustedHtml('safe', document)) } catch (error) { reference = error.name }
    try { insertSanitizedHtml(element, position, 'safe') } catch (error) { actual = error.name }
    assert(actual === expected && actual === reference, `Native adjacent error changed: ${position}`)
  }
})

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
  const renderer = new EditorRenderer({ injectStyles: false, blockTypes: ['paragraph', 'heading'] })
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
    const content = await waitForEmbeddedDocument(frame, document => document.querySelector('p'))
    assert(content.querySelector('p').textContent === 'safe', 'safe Raw content missing from preview')
    assert(!/onclick|<script/i.test(content.body.innerHTML), 'unsafe Raw content survived preview sanitization')
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

await test('Raw HTML preserves its benign corpus and rejects active markup in the owning Trusted Types realm', async () => {
  const frame = document.createElement('iframe')
  document.querySelector('#sandbox').appendChild(frame)
  const childDocument = frame.contentDocument
  assert(childDocument?.defaultView && childDocument.defaultView !== window, 'a real second Window is required')
  const childTypes = childDocument.defaultView.trustedTypes
  const originalPolicyDescriptor = Object.getOwnPropertyDescriptor(childTypes, 'createPolicy')
  const createPolicy = childTypes.createPolicy
  const childPolicies = []
  Object.defineProperty(childTypes, 'createPolicy', { configurable: true, value(name, rules) {
    childPolicies.push(name)
    return Reflect.apply(createPolicy, childTypes, [name, rules])
  } })
  const html = '<p id="raw-text" class="article-accent" lang="ru" style="font-size:201px;color:rgb(1,2,3)">Safe <strong>bold</strong> <em>italic</em></p>'
    + '<a href="#raw-text" download="article.txt">local</a><video controls preload="none"></video>'
    + '<script>bad()</script><img src="javascript:bad()" onerror="bad()"><iframe srcdoc="bad()"></iframe>'
    + '<a id="raw-unsafe" href="javascript:bad()" onclick="bad()">unsafe</a>'
  const verify = (host, ownerDocument) => {
    assert(host.ownerDocument === ownerDocument, 'output belongs to a different document')
    assert([...host.querySelectorAll('*')].every(node => node.ownerDocument === ownerDocument), 'a descendant escaped its owning document')
    assert(!host.querySelector('script,iframe,object,embed,form,meta,link,base'), 'active element survived')
    assert([...host.querySelectorAll('*')].every(node => [...node.attributes].every(attribute => !attribute.name.startsWith('on'))), 'event handler survived')
    const text = host.querySelector('#raw-text')
    assert(text?.textContent === 'Safe bold italic' && text.querySelector('strong')?.textContent === 'bold'
      && text.querySelector('em')?.textContent === 'italic', 'benign text or marks changed')
    assert(text.className === 'article-accent' && text.lang === 'ru', 'benign class or language changed')
    assert(text.style.fontSize === '201px' && text.style.color === 'rgb(1, 2, 3)', 'benign typography changed')
    const local = host.querySelector('a[download]')
    assert(local?.getAttribute('href') === '#raw-text' && local.download === 'article.txt', 'fragment or download metadata changed')
    assert(host.querySelector('video')?.controls === true, 'native video controls were removed')
    assert(!host.querySelector('img')?.hasAttribute('src') && !host.querySelector('#raw-unsafe')?.hasAttribute('href'), 'active URL survived')
  }
  try {
    for (const ownerDocument of [document, childDocument]) {
      const host = ownerDocument.createElement('section')
      ownerDocument.body.appendChild(host)
      let renderer
      try {
        let rejectedString = false
        try { host.innerHTML = '<b>untrusted</b>' } catch (error) { rejectedString = error.name === 'TypeError' }
        assert(rejectedString, 'the owning realm must actually enforce Trusted Types')
        setSanitizedRawHtml(host, html)
        verify(host, ownerDocument)
        const string = sanitizeRawHtml(html, ownerDocument)
        assert(typeof string === 'string', 'the public string API changed')
        const trusted = sanitizeRawHtmlForSink(html, ownerDocument)
        assert(ownerDocument.defaultView.trustedTypes.isHTML(trusted), 'the sink value is not TrustedHTML')
        assert(String(trusted) === string, 'signing changed the sanitized serialization')
        host.innerHTML = trusted
        verify(host, ownerDocument)
        renderer = new EditorRenderer({ ownerDocument, injectStyles: false, blockTypes: ['raw'] })
        const input = { version: '2.0.0', blocks: [{ id: 'realm-raw', type: 'raw', dataVersion: 1, data: { html } }] }
        const before = JSON.stringify(input)
        const output = renderer.render(input)
        host.replaceChildren(output)
        assert(output.ownerDocument === ownerDocument, 'the renderer wrapper did not follow its explicit mount realm')
        const content = await waitForEmbeddedDocument(output.querySelector('iframe'), document => document.querySelector('#raw-text'))
        verify(content.body, content)
        assert(JSON.stringify(input) === before, 'rendering rewrote caller data')
      } finally {
        renderer?.destroy()
        host.remove()
      }
    }
    assert(childPolicies.filter(name => name === 'rector').length === 1,
      'the sanitizer must acquire and reuse the real owning Window policy')
    assert(!childPolicies.includes('dompurify'), 'Rector must not reserve an independent host sanitizer policy name')
  } finally {
    if (originalPolicyDescriptor) Object.defineProperty(childTypes, 'createPolicy', originalPolicyDescriptor)
    else delete childTypes.createPolicy
    frame.remove()
  }
})

const failed = results.filter(result => result.status !== 'PASS')
document.querySelector('#result').textContent = JSON.stringify(results, null, 2)
document.body.dataset.status = failed.length ? 'fail' : 'pass'
