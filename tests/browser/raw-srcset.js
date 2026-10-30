import * as sanitizer from '../../shared/sanitize/sanitizeRawHtml.js'
import { createEditor } from '../../core/index.js'
import { createRawPlugin } from '../../plugins/raw/index.js'
import { createCarouselPlugin } from '../../plugins/carousel/index.js'
import { EditorRenderer } from '../../renderer/index.js'
import { srcsetCases, srcsetDefinition, observeSrcset } from './raw-srcset-fixture.js'
import { test, equal, assert, run } from './regressions/harness.js'

for (const name of srcsetCases) test('Raw responsive source preservation: ' + name, async () => {
  const result = await observeSrcset({ name, sanitizer })
  equal(result.complete, true, result.error)
  equal(result.observations.filter(value => value.status !== 'PASS'), [])
})

test('Raw srcset rejects every unsafe candidate without retaining a resource-bearing attribute', () => {
  const host = document.createElement('div')
  for (const input of [
    'javascript:alert(1) 1x',
    'data:image/svg+xml,%3Csvg%20onload=bad()%3E 1x',
    'https://user:pass@example.invalid/image.png 1x',
    'mailto:person@example.invalid 1x, file:///tmp/image.png 2x',
  ]) {
    sanitizer.setSanitizedRawHtml(host, `<b>Before</b><img srcset="${input}"><i>After</i>`)
    equal(host.querySelector('img').getAttribute('srcset'), null)
    equal(host.textContent, 'BeforeAfter')
    equal(host.children.length, 3)
  }
})

test('Raw srcset preserves permitted blob and raster data candidates', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  const url = URL.createObjectURL(blob)
  const host = document.createElement('div')
  document.body.append(host)
  try {
    for (const source of [url + '#asset,one', canvas.toDataURL('image/png')]) {
      sanitizer.setSanitizedRawHtml(host, `<img srcset="${source} 1x">`)
      await host.firstElementChild.decode()
      equal(host.firstElementChild.currentSrc, source)
      equal(host.firstElementChild.getAttribute('srcset'), source + ' 1x')
    }
  } finally {
    host.remove()
    URL.revokeObjectURL(url)
  }
})

test('Raw srcset uses the foreign owning document for output and image selection', async () => {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  try {
    for (const name of ['comma-url', 'exponent-density', 'unsafe-leading-candidate']) {
      const result = await observeSrcset({ name, sanitizer, ownerDocument: frame.contentDocument })
      equal(result.complete, true, result.error)
      equal(result.observations.filter(value => value.status !== 'PASS'), [])
    }
  } finally { frame.remove() }
})

test('Raw HTML sink signing preserves responsive URLs under the owning Trusted Types policy', async () => {
  const expected = srcsetDefinition('positive-exponent-density')
  const html = `<img srcset="${expected.input}" alt="Sink image">`
  const host = document.createElement('div')
  document.body.append(host)
  try {
    const signed = sanitizer.sanitizeRawHtmlForSink(html)
    equal(String(signed), sanitizer.sanitizeRawHtml(html))
    if (globalThis.trustedTypes) equal(trustedTypes.isHTML(signed), true)
    host.innerHTML = signed
    await host.firstElementChild.decode()
    equal(host.firstElementChild.currentSrc, expected.expectedCurrentSrc)
    if (location.pathname.includes('trusted-types')) {
      let rejected = false
      try { host.innerHTML = '<b>untrusted</b>' } catch (error) { rejected = error.name === 'TypeError' }
      equal(rejected, true, 'The test document must actually enforce Trusted Types')
    }
  } finally { host.remove() }
})

test('Raw and Carousel views preserve responsive source data through projection and disposal', async () => {
  const expected = srcsetDefinition('exponent-density')
  const html = `<b>Lead</b><img srcset="${expected.input}" alt="Responsive sample"><i>Tail</i>`
  const options = { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false }
  const input = { version: '2.0.0', blocks: [
    { id: 'raw', type: 'raw', dataVersion: 1, data: { html } },
    { id: 'carousel', type: 'carousel', dataVersion: 1, data: { slides: [{ id: 'html', type: 'html', html, caption: '' }], options } },
  ] }
  const original = JSON.stringify(input)
  const holder = document.createElement('section')
  const output = document.createElement('section')
  document.body.append(holder, output)
  const renderer = new EditorRenderer({ blockTypes: ['raw', 'carousel'], injectStyles: false })
  let editor
  try {
    editor = createEditor({ holder, readOnly: true, injectStyles: false,
      plugins: [createRawPlugin({ injectStyles: false }), createCarouselPlugin({ injectStyles: false })], data: input })
    const preview = holder.querySelector('.oe-raw__preview iframe')
    equal(preview.srcdoc, html)
    equal(preview.getAttribute('sandbox'), '')
    const image = holder.querySelector('.oe-carousel-block img')
    await image.decode()
    equal(image.currentSrc, expected.expectedCurrentSrc)
    equal(editor.save().blocks.map(block => block.type === 'raw' ? block.data.html : block.data.slides[0].html), [html, html])
    equal(editor.canUndo, false)
    equal(editor.canRedo, false)
    renderer.renderTo(input, output)
    const images = [...output.querySelectorAll('img')]
    equal(images.length, 2)
    for (const rendered of images) {
      await rendered.decode()
      equal(rendered.currentSrc, expected.expectedCurrentSrc)
      equal(rendered.alt, 'Responsive sample')
    }
    equal(JSON.stringify(input), original)
    editor.destroy()
    renderer.destroy()
    equal(holder.querySelector('.oe-editor'), null)
    equal(output.children.length, 0)
  } finally {
    editor?.destroy()
    renderer.destroy()
    holder.remove()
    output.remove()
  }
})

test('Raw preview update and Undo/Redo retain original authored source and responsive selection metadata', () => {
  const first = srcsetDefinition('comma-url')
  const second = srcsetDefinition('exponent-density')
  const html = `<img srcset="${first.input}" alt="First">`
  const changed = `<img srcset="${second.input}" alt="Second">`
  const holder = document.createElement('section')
  document.body.append(holder)
  const editor = createEditor({ holder, injectStyles: false, plugins: [createRawPlugin({ injectStyles: false })],
    data: { version: '2.0.0', blocks: [{ id: 'raw', type: 'raw', dataVersion: 1, data: { html } }] } })
  try {
    holder.querySelector('.oe-raw__toggle').click()
    const preview = () => holder.querySelector('.oe-raw__preview iframe')
    equal(preview().srcdoc, html)
    const old = preview()
    editor.blocks.update('raw', block => ({ data: { ...block.data, html: changed } }))
    assert(preview() !== old && !old.isConnected)
    equal(editor.save().blocks[0].data.html, changed)
    equal(preview().srcdoc, changed)
    equal(editor.canUndo, true)
    equal(editor.canRedo, false)
    editor.undo()
    equal(editor.save().blocks[0].data.html, html)
    equal(preview().srcdoc, html)
    equal(editor.canUndo, false)
    equal(editor.canRedo, true)
    editor.redo()
    equal(editor.save().blocks[0].data.html, changed)
    equal(preview().srcdoc, changed)
    equal(editor.canUndo, true)
    equal(editor.canRedo, false)
  } finally {
    editor.destroy()
    holder.remove()
  }
})

await run()
