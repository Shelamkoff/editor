import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateToggleData } from '../../shared/blockDataValidators.js'

const editorStyles = resolvePath('./toggle.css', import.meta.url)

// Tabler icon: chevron-right (rotates when open)
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v-3a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3"/><path d="M20 12v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3"/></svg>'

const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg>'


export class Toggle extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'toggle'
  icon = ICON
  inlineTools = true

  /** @returns {string} */
  get title() {
    return this._t('title', 'Toggle')
  }

  /**
   * @param {{ title?: string, content?: string, open?: boolean }} data
   * @returns {HTMLElement}
   */
  render(data, context) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-toggle')
    if (data?.open) wrapper.classList.add('oe-toggle--open')

    // Header (toggle trigger)
    const header = document.createElement('div')
    header.className = 'oe-toggle__header'

    const chevron = document.createElement('button')
    chevron.type = 'button'
    chevron.className = 'oe-toggle__chevron'
    chevron.innerHTML = ICON_CHEVRON
    chevron.setAttribute('aria-label', this._t('toggleLabel', 'Show or hide content'))
    chevron.setAttribute('aria-expanded', String(wrapper.classList.contains('oe-toggle--open')))
    chevron.addEventListener('mousedown', (e) => e.preventDefault())
    chevron.addEventListener('click', (e) => {
      e.stopPropagation()
      context.mutate(() => {
        const open = wrapper.classList.toggle('oe-toggle--open')
        chevron.setAttribute('aria-expanded', String(open))
      })
    })

    const titleEl = document.createElement('div')
    titleEl.className = 'oe-toggle__title'
    titleEl.contentEditable = 'true'
    titleEl.dataset.placeholder = this._t('titlePlaceholder', 'Toggle title...')
    if (data?.title) titleEl.innerHTML = sanitizeHtml(data.title)
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        context.mutate(() => {
          wrapper.classList.add('oe-toggle--open')
          chevron.setAttribute('aria-expanded', 'true')
        })
        const body = wrapper.querySelector('.oe-toggle__body')
        if (body) /** @type {HTMLElement} */ (body).focus()
      }
    })

    header.append(chevron, titleEl)
    wrapper.appendChild(header)

    // Body (collapsible content)
    const body = document.createElement('div')
    body.className = 'oe-toggle__body'
    body.contentEditable = 'true'
    body.dataset.placeholder = this._t('bodyPlaceholder', 'Hidden content...')
    if (data?.content) body.innerHTML = sanitizeHtml(data.content)
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.stopPropagation()
      }
    })

    wrapper.appendChild(body)

    return wrapper
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ title: string, content: string, open: boolean }}
   */
  save(element) {
    const title = element.querySelector('.oe-toggle__title')
    const body = element.querySelector('.oe-toggle__body')
    return {
      title: sanitizeHtml(title?.innerHTML?.trim() || ''),
      content: sanitizeHtml(body?.innerHTML?.trim() || ''),
      open: element.classList.contains('oe-toggle--open'),
    }
  }

  /** @param {Record<string, unknown>} data */
  validate(data) {
    return validateToggleData(data)
  }

  /** @param {HTMLElement} element */
  isEmpty(element) {
    const title = element.querySelector('.oe-toggle__title')
    const body = element.querySelector('.oe-toggle__body')
    return !title?.textContent?.trim() && !body?.textContent?.trim()
  }

  /** @param {HTMLElement} element */
  exportData(element) {
    const title = element.querySelector('.oe-toggle__title')?.textContent?.trim() || ''
    return { text: title }
  }

  /**
   * @param {HTMLElement} element
   * @param {Record<string, unknown>} data
   */
  merge(element, data) {
    const body = element.querySelector('.oe-toggle__body')
    if (body && data?.text) {
      if (body.innerHTML.trim()) body.innerHTML += '<br>'
      body.innerHTML += sanitizeHtml(String(data.text))
      element.classList.add('oe-toggle--open')
    }
  }

}
