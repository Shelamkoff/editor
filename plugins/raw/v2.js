// @ts-check
import { dedentTextarea } from '../shared/dedentTextarea.js'
import { rawDataSchema } from '../../shared/blockSchemas/raw.js'
import { sanitizeRawHtmlForSink } from '../../shared/sanitize/sanitizeRawHtml.js'

const editorStyles = new URL('./raw.css', import.meta.url).href
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 16v-8l2 5l2-5v8"/><path d="M1 16v-8"/><path d="M5 8v8"/><path d="M1 12h4"/><path d="M7 8h4"/><path d="M9 8v8"/><path d="M20 8v8h3"/></svg>'

let rawSequence = 0

/**
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{ html: string }>}
 */
export function createRawPlugin() {
  return Object.freeze({
    type: 'raw',
    label: Object.freeze({ key: 'title', fallback: 'Raw HTML' }),
    icon: ICON,
    styles: Object.freeze([editorStyles]),
    schema: rawDataSchema,
    capabilities: Object.freeze({
      empty: Object.freeze({ isEmpty: data => data.html.trim().length === 0 }),
      conversion: Object.freeze({
        export: data => ({ kind: 'plain-text', data: { text: data.html } }),
        canImport: payload => payload?.kind === 'plain-text' && typeof payload.data?.text === 'string',
        import(payload) {
          if (payload?.kind !== 'plain-text' || typeof payload.data?.text !== 'string') {
            throw new TypeError('Raw can only import plain-text payloads')
          }
          return { html: payload.data.text }
        },
      }),
    }),
    setup(runtimeContext) {
      let destroyed = false
      return {
        create(initial, context) {
          if (destroyed) throw new Error('Raw runtime is destroyed')
          const document = context.ownerDocument
          const wrapper = document.createElement('div')
          wrapper.className = 'oe-raw'
          wrapper.contentEditable = 'false'
          wrapper.tabIndex = -1

          const bar = document.createElement('div')
          bar.className = 'oe-raw__bar'
          const label = document.createElement('span')
          label.className = 'oe-raw__label'
          label.textContent = 'HTML'
          const toggle = document.createElement('button')
          toggle.type = 'button'
          toggle.className = 'oe-raw__toggle'
          toggle.textContent = runtimeContext.t('preview', 'Preview')

          const textarea = document.createElement('textarea')
          textarea.setAttribute('data-oe-document-input', '')
          textarea.className = 'oe-raw__textarea'
          textarea.placeholder = runtimeContext.t('placeholder', 'Paste HTML code...')
          textarea.value = initial.html
          textarea.spellcheck = false

          const preview = document.createElement('div')
          preview.className = 'oe-raw__preview'
          preview.id = `oe-raw-preview-${++rawSequence}`
          toggle.setAttribute('aria-controls', preview.id)

          bar.append(label, toggle)
          wrapper.append(bar, textarea, preview)

          let readOnly = context.isReadOnly()
          let showPreview = readOnly
          let instanceDestroyed = false

          const resize = () => {
            textarea.style.height = 'auto'
            textarea.style.height = textarea.scrollHeight + 'px'
          }

          const renderPreview = () => {
            toggle.setAttribute('aria-pressed', String(showPreview))
            textarea.style.display = showPreview ? 'none' : ''
            preview.style.display = showPreview ? '' : 'none'
            preview.replaceChildren()
            if (!showPreview) {
              runtimeContext.ownerDocument.defaultView?.requestAnimationFrame(resize)
              return
            }
            const iframe = document.createElement('iframe')
            iframe.sandbox = ''
            iframe.title = runtimeContext.t('previewFrame', 'HTML preview')
            iframe.style.cssText = 'width:100%;border:none;min-height:100px'
            iframe.srcdoc = /** @type {any} */ (sanitizeRawHtmlForSink(textarea.value, document))
            preview.appendChild(iframe)
          }

          toggle.addEventListener('mousedown', event => event.preventDefault(), { signal: context.signal })
          toggle.addEventListener('click', () => {
            if (readOnly || instanceDestroyed) return
            showPreview = !showPreview
            renderPreview()
          }, { signal: context.signal })

          textarea.addEventListener('input', resize, { signal: context.signal })
          textarea.addEventListener('keydown', event => {
            if (event.key === 'Enter') event.stopPropagation()
            if (event.key !== 'Tab' || readOnly) return
            event.preventDefault()
            event.stopPropagation()
            context.commitDomMutation(() => {
              const start = textarea.selectionStart
              const end = textarea.selectionEnd
              if (event.shiftKey) {
                dedentTextarea(textarea, 2)
              } else {
                textarea.setRangeText('  ', start, end, 'end')
              }
              resize()
            })
          }, { signal: context.signal })

          const applyReadOnly = value => {
            readOnly = value
            textarea.readOnly = value
            toggle.hidden = value
            toggle.disabled = value
            if (value) showPreview = true
            renderPreview()
          }

          applyReadOnly(readOnly)
          document.defaultView?.requestAnimationFrame(resize)

          return {
            element: wrapper,
            read: () => ({ html: textarea.value }),
            update(next) {
              if (instanceDestroyed || textarea.value === next.html) return
              textarea.value = next.html
              resize()
              if (showPreview) renderPreview()
            },
            editableFields() {
              return Object.freeze([Object.freeze({
                key: 'html',
                element: textarea,
                mode: /** @type {'plain-text'} */ ('plain-text'),
              })])
            },
            setReadOnly: applyReadOnly,
            focus() {
              if (!instanceDestroyed && !readOnly) textarea.focus()
            },
            destroy() {
              instanceDestroyed = true
              preview.replaceChildren()
            },
          }
        },
        destroy() {
          destroyed = true
        },
      }
    },
  })
}
