import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'

const editorStyles = resolvePath('./raw.css', import.meta.url)

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 16v-8l2 5l2-5v8"/><path d="M1 16v-8"/><path d="M5 8v8"/><path d="M1 12h4"/><path d="M7 8h4"/><path d="M9 8v8"/><path d="M20 8v8h3"/></svg>'

/** @type {WeakMap<HTMLElement, { textarea: HTMLTextAreaElement, preview: HTMLDivElement, showPreview: boolean }>} */
const stateMap = new WeakMap()


export class Raw extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'raw'
  icon = ICON
  inlineTools = false

  /** @returns {string} */
  get title() {
    return this._t('title', 'Raw HTML')
  }

  /**
   * @param {{ html?: string }} data
   * @returns {HTMLElement}
   */
  render(data) {
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
    toggleBtn.addEventListener('mousedown', (e) => e.preventDefault())
    toggleBtn.addEventListener('click', () => {
      const s = stateMap.get(wrapper)
      if (s) {
        s.showPreview = !s.showPreview
        this.#syncPreview(wrapper)
      }
    })

    bar.append(label, toggleBtn)

    // Textarea (code input)
    const textarea = document.createElement('textarea')
    textarea.className = 'oe-raw__textarea'
    textarea.placeholder = this._t('placeholder', 'Paste HTML code...')
    textarea.value = data?.html || ''
    textarea.spellcheck = false
    textarea.addEventListener('input', () => {
      this.#autoResize(textarea)
      wrapper.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.stopPropagation()
      if (e.key === 'Tab') {
        e.preventDefault()
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end)
        textarea.selectionStart = textarea.selectionEnd = start + 2
      }
    })

    // Preview container
    const preview = document.createElement('div')
    preview.className = 'oe-raw__preview'
    preview.style.display = 'none'

    stateMap.set(wrapper, { textarea, preview, showPreview: false })

    wrapper.append(bar, textarea, preview)

    requestAnimationFrame(() => this.#autoResize(textarea))

    return wrapper
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ html: string }}
   */
  save(element) {
    const s = stateMap.get(element)
    return { html: s?.textarea?.value || '' }
  }

  /**
   * @param {{ html?: string }} data
   * @returns {boolean}
   */
  validate(data) {
    return !!data?.html?.trim()
  }

  /**
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const s = stateMap.get(element)
    return !s?.textarea?.value?.trim()
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const s = stateMap.get(element)
    return { text: s?.textarea?.value || '' }
  }

  /**
   * @param {HTMLElement} element
   */
  destroy(element) {
    stateMap.delete(element)
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** @param {HTMLTextAreaElement} textarea */
  #autoResize(textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = textarea.scrollHeight + 'px'
  }

  /** @param {HTMLElement} wrapper */
  #syncPreview(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return

    if (s.showPreview) {
      s.textarea.style.display = 'none'
      s.preview.style.display = ''
      s.preview.textContent = ''
      const iframe = document.createElement('iframe')
      iframe.sandbox = ''
      iframe.style.cssText = 'width:100%;border:none;min-height:100px'
      s.preview.appendChild(iframe)
      iframe.contentDocument?.open()
      iframe.contentDocument?.write(s.textarea.value)
      iframe.contentDocument?.close()
      const resizeIframe = () => {
        const h = iframe.contentDocument?.documentElement?.scrollHeight
        if (h) iframe.style.height = h + 'px'
      }
      iframe.addEventListener('load', resizeIframe)
      requestAnimationFrame(resizeIframe)
      wrapper.querySelector('.oe-raw__toggle')?.classList.add('oe-raw__toggle--active')
    } else {
      s.textarea.style.display = ''
      s.preview.style.display = 'none'
      wrapper.querySelector('.oe-raw__toggle')?.classList.remove('oe-raw__toggle--active')
      requestAnimationFrame(() => this.#autoResize(s.textarea))
    }
  }
}
