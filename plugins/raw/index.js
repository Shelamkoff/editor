import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateRawData } from '../../shared/blockDataValidators.js'
import { normalizeTextValue } from '../../shared/textFormat.js'
import { sanitizeRawHtml } from '../../shared/sanitize/sanitizeRawHtml.js'

const editorStyles = new URL('./raw.css', import.meta.url).href

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 16v-8l2 5l2-5v8"/><path d="M1 16v-8"/><path d="M5 8v8"/><path d="M1 12h4"/><path d="M7 8h4"/><path d="M9 8v8"/><path d="M20 8v8h3"/></svg>'


const stateMap = new WeakMap()
let rawSequence = 0
/** Raw HTML source block with an optional sanitized editor preview. */
export class Raw extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'raw'
  icon = ICON
  inlineTools = false

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Raw HTML')
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {{ html?: string }} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const previewId = `oe-raw-preview-${++rawSequence}`
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-raw')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    // Header bar
    const bar = document.createElement('div')
    bar.className = 'oe-raw__bar'

    const label = document.createElement('span')
    label.className = 'oe-raw__label'
    label.textContent = 'HTML'

    const toggleBtn = document.createElement('button')
    toggleBtn.type = 'button'
    toggleBtn.className = 'oe-raw__toggle'
    toggleBtn.textContent = this._t('preview', 'Preview')
    toggleBtn.setAttribute('aria-pressed', 'false')
    toggleBtn.setAttribute('aria-controls', previewId)
    toggleBtn.hidden = context.readOnly
    toggleBtn.disabled = context.readOnly
    toggleBtn.addEventListener('mousedown', (e) => e.preventDefault())
    toggleBtn.addEventListener('click', () => {
      const s = stateMap.get(wrapper)
      if (s) {
        s.showPreview = !s.showPreview
        toggleBtn.setAttribute('aria-pressed', String(s.showPreview))
        this.#syncPreview(wrapper)
      }
    })

    bar.append(label, toggleBtn)

    // Textarea (code input)
    const textarea = document.createElement('textarea')
    textarea.setAttribute('data-oe-document-input', '')
    textarea.className = 'oe-raw__textarea'
    textarea.placeholder = this._t('placeholder', 'Paste HTML code...')
    textarea.value = normalizeTextValue(data?.html)
    textarea.spellcheck = false
    textarea.readOnly = context.readOnly
    textarea.addEventListener('input', () => {
      this.#autoResize(textarea)
    })
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.stopPropagation()
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        context.mutate(() => {
          const start = textarea.selectionStart
          const end = textarea.selectionEnd
          const value = textarea.value
          const lineStart = value.lastIndexOf('\n', start - 1) + 1
          if (e.shiftKey) {
            const selected = value.substring(lineStart, end)
            const dedented = selected.replace(/^ {1,2}/gm, '')
            if (selected === dedented) return
            const firstIndent = selected.match(/^ {1,2}/)?.[0].length ?? 0
            textarea.value = value.substring(0, lineStart) + dedented + value.substring(end)
            textarea.selectionStart = Math.max(lineStart, start - firstIndent)
            textarea.selectionEnd = end > start
              ? lineStart + dedented.length
              : textarea.selectionStart
          } else if (start !== end && value.substring(start, end).includes('\n')) {
            const before = value.substring(0, start)
            const selected = value.substring(start, end)
            const after = value.substring(end)
            const prefix = before.substring(lineStart)
            const indented = '  ' + (prefix + selected).replace(/\n/g, '\n  ')
            textarea.value = before.substring(0, lineStart) + indented + after
            textarea.selectionStart = lineStart
            textarea.selectionEnd = lineStart + indented.length
          } else {
            textarea.value = value.substring(0, start) + '  ' + value.substring(end)
            textarea.selectionStart = textarea.selectionEnd = start + 2
          }
          this.#autoResize(textarea)
        })
      }
    })

    // Preview container
    const preview = document.createElement('div')
    preview.className = 'oe-raw__preview'
    preview.id = previewId
    preview.style.display = 'none'

    stateMap.set(wrapper, { textarea, preview, showPreview: context.readOnly })

    wrapper.append(bar, textarea, preview)

    requestAnimationFrame(() => this.#autoResize(textarea))
    if (context.readOnly) this.#syncPreview(wrapper)

    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {{ html: string }}
   */
  save(element) {
    const s = stateMap.get(element)
    return { html: s?.textarea?.value || '' }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {{ html?: string }} data
   * @returns {boolean}
   */
  validate(data) {
    return validateRawData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const s = stateMap.get(element)
    return !s?.textarea?.value?.trim()
  }

  /**
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const s = stateMap.get(element)
    return { text: s?.textarea?.value || '' }
  }

  /**
   * Release listeners and resources owned by this block element.
   * @param {HTMLElement} element
   * @returns {void}
   */
  destroy(element) {
    stateMap.delete(element)
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** @param {HTMLTextAreaElement} textarea @returns {void} */
  #autoResize(textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = textarea.scrollHeight + 'px'
  }

  /** @param {HTMLElement} wrapper @returns {void} */
  #syncPreview(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const toggle = /** @type {HTMLButtonElement | null} */ (wrapper.querySelector('.oe-raw__toggle'))
    toggle?.setAttribute('aria-pressed', String(s.showPreview))

    if (s.showPreview) {
      s.textarea.style.display = 'none'
      s.preview.style.display = ''
      s.preview.textContent = ''
      const iframe = document.createElement('iframe')
      iframe.sandbox = ''
      iframe.title = this._t('previewFrame', 'HTML preview')
      iframe.style.cssText = 'width:100%;border:none;min-height:100px'
      iframe.srcdoc = sanitizeRawHtml(s.textarea.value)
      s.preview.appendChild(iframe)
      const resizeIframe = () => {
        try {
          const h = iframe.contentDocument?.documentElement?.scrollHeight
          if (h) iframe.style.height = h + 'px'
        } catch {
          // A sandboxed srcdoc intentionally has an opaque origin in browsers
          // that enforce it here. The minimum height remains the safe fallback.
        }
      }
      iframe.addEventListener('load', resizeIframe)
      requestAnimationFrame(resizeIframe)
      toggle?.classList.add('oe-raw__toggle--active')
    } else {
      s.textarea.style.display = ''
      s.preview.style.display = 'none'
      toggle?.classList.remove('oe-raw__toggle--active')
      requestAnimationFrame(() => this.#autoResize(s.textarea))
    }
  }
}
