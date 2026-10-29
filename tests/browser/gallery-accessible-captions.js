import { createEditor } from '../../index.js'
import { createGalleryPlugin } from '../../plugins/gallery/index.js'
import { createMentionPlugin, createMentionRenderer } from '../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin, createColorSwatchRenderer } from '../../inline-plugins/color.js'
import { EditorRenderer } from '../../renderer/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
// These expectations are authored literals, independent of Rector's parser.
// The final entity pair must be decoded once, and widget text stays literal.
const captions = [
  'Literal &lt;b&gt;name&lt;/b&gt; &amp; {{literal}} &amp;lt;twice&amp;gt;',
  '<b>Alpha</b> <i>{{mention}}</i> <mark>{{swatch}}</mark> tail',
  '',
]
const labels = ['Literal <b>name</b> & {{literal}} &lt;twice&gt;', 'Alpha @Ada <&> #123456 tail', '']
const inline = {
  mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada <&>' } },
  swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
}
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value

export async function runGalleryAccessibleCaptionTests(sandbox) {
  const results = [], errors = []
  const check = (name, actual, expected) => {
    const pass = JSON.stringify(stable(actual)) === JSON.stringify(stable(expected))
    results.push({ name, status: pass ? 'PASS' : 'FAIL',
      ...(!pass ? { actual, expected, error: JSON.stringify({ actual, expected }) } : {}) })
  }
  const onError = event => errors.push(String(event.error?.stack ?? event.message))
  const onRejection = event => errors.push(String(event.reason?.stack ?? event.reason))
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  const frame = document.createElement('iframe')
  frame.hidden = true
  frame.src = 'about:blank'
  const ready = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
  sandbox.append(frame)
  let providerCalls = 0
  try {
    await ready
    const foreignDocument = frame.contentDocument
    for (const layout of ['auto', '3a', 'masonry']) {
      const source = { version: '2.0.0', blocks: [{ id: 'gallery-caption', type: 'gallery', dataVersion: 2,
        data: { images: captions.map((caption, index) => ({ id: `image-${index}`, url: pixel, caption })),
          layout, styles: {}, options: { loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false } },
        inline: structuredClone(inline),
      }] }
      const inputBytes = JSON.stringify(source)
      const holder = document.createElement('section')
      sandbox.append(holder)
      let editor
      try {
        editor = createEditor({ holder, data: source, defaultBlock: 'gallery', injectStyles: false, inlineTools: [],
          plugins: [createGalleryPlugin({ injectStyles: false })],
          inlinePlugins: [createMentionPlugin({ searchFunction: async () => { providerCalls++; return [] } }), createColorSwatchPlugin()],
        })
        const saved = editor.save()
        check(`${layout}: saved canonical captions and IDs`, saved.blocks[0].data, source.blocks[0].data)
        check(`${layout}: saved canonical inline records`, saved.blocks[0].inline, inline)
        check(`${layout}: editor input unchanged`, JSON.stringify(source), inputBytes)

        for (const [sourceName, data] of [['intact input', source], ['saved input', saved]]) {
          const prefix = `${layout}/${sourceName}`
          const beforeRender = JSON.stringify(data)
          let calls = []
          const renderers = [createMentionRenderer(), createColorSwatchRenderer()].map(definition => ({
            ...definition,
            render(id, payload, context) {
              const element = definition.render(id, payload, context)
              calls.push({ id, document: context.ownerDocument, elementDocument: element.ownerDocument })
              return element
            },
          }))
          const renderer = new EditorRenderer({ blockTypes: ['gallery'], injectStyles: false, inlineRenderers: renderers })
          let detached
          const mainTarget = document.createElement('section'), foreignTarget = foreignDocument.createElement('section')
          sandbox.append(mainTarget); foreignDocument.body.append(foreignTarget)
          const inspect = (root, ownerDocument, path) => {
            const items = [...root.querySelectorAll('.editor-gallery__item')]
            check(`${prefix}/${path}: literal and widget image alternatives`, items.slice(0, 2).map(item => item.querySelector('img').alt), labels.slice(0, 2))
            check(`${prefix}/${path}: literal and widget accessible names`, items.slice(0, 2).map(item => item.getAttribute('aria-label')), labels.slice(0, 2).map(label => `Open image: ${label}`))
            check(`${prefix}/${path}: empty-caption fallback`, items.slice(2).map(item => ({ alt: item.querySelector('img').alt, label: item.getAttribute('aria-label') })), [{ alt: '', label: 'Open image' }])
            check(`${prefix}/${path}: output structure and document`, {
              count: items.length, roles: items.map(item => item.getAttribute('role')),
              sources: items.map(item => item.querySelector('img').getAttribute('src')),
              owned: [...root.querySelectorAll('*')].every(element => element.ownerDocument === ownerDocument),
            }, { count: 3, roles: ['button', 'button', 'button'], sources: [pixel, pixel, pixel], owned: true })
          }
          const checkParserDocument = (ownerDocument, path) => check(`${prefix}/${path}: real widget renderer documents`, calls.map(call => ({
            id: call.id, context: call.document === ownerDocument, output: call.elementDocument === ownerDocument,
          })), [{ id: 'mention', context: true, output: true }, { id: 'swatch', context: true, output: true }])
          try {
            detached = renderer.render(data)
            check(`${prefix}/render: initially detached`, detached.isConnected, false)
            inspect(detached, document, 'detached render')
            checkParserDocument(document, 'detached render')
            sandbox.append(detached)
            inspect(detached, document, 'mounted render result')
            calls = []
            renderer.renderTo(data, mainTarget)
            inspect(mainTarget, document, 'renderTo main document')
            checkParserDocument(document, 'renderTo main document')
            calls = []
            renderer.renderTo(data, foreignTarget)
            inspect(foreignTarget, foreignDocument, 'renderTo owning iframe document')
            checkParserDocument(foreignDocument, 'renderTo owning iframe document')
            check(`${prefix}: renderer input unchanged`, JSON.stringify(data), beforeRender)
          } catch (error) {
            results.push({ name: prefix, status: 'FAIL', error: error.stack ?? String(error) })
          } finally {
            try {
              if (detached) renderer.destroy(detached)
              renderer.destroy(mainTarget); renderer.destroy(foreignTarget); renderer.destroy()
              check(`${prefix}: output disposal`, [detached?.childNodes.length ?? 0, mainTarget.childNodes.length, foreignTarget.childNodes.length], [0, 0, 0])
            } finally { detached?.remove(); mainTarget.remove(); foreignTarget.remove() }
          }
        }
      } finally {
        editor?.destroy()
        check(`${layout}: editor disposal`, holder.childNodes.length, 0)
        holder.remove()
      }
    }
    await new Promise(resolve => requestAnimationFrame(resolve))
    check('Gallery captions do not invoke a provider', providerCalls, 0)
    check('Gallery captions have no page errors', errors, [])
  } finally {
    frame.remove()
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
  return results
}
