import { sanitizeHtml } from '../../core/sanitize.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateToggleData } from '../../shared/blockDataValidators.js'
import { mapToggleTextFields } from '../../shared/mapTextFields.js'
import { normalizeTextValue } from '../../shared/textFormat.js'
import { READ_ONLY_INTERACTIVE_ATTRIBUTE } from '../../core/constants.js'

const editorStyles = new URL('./toggle.css', import.meta.url).href

let toggleSequence = 0

/** @type {WeakMap<HTMLElement, { open: boolean, context: import('../../core/types').BlockMutationContext }>} */
const stateMap = new WeakMap()

// Tabler icon: chevron-right (rotates when open)
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v-3a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3"/><path d="M20 12v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3"/></svg>'

const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg>'

/** Expandable rich-text block with an editable title and body. */
export class Toggle extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'toggle'
  icon = ICON
  inlineTools = true
  mapTextFields = mapToggleTextFields

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Toggle')
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {{ title?: string, content?: string, open?: boolean }} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const bodyId = `oe-toggle-body-${++toggleSequence}`
    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-toggle')
    const open = data?.open === true
    if (open) wrapper.classList.add('oe-toggle--open')
    stateMap.set(wrapper, { open, context })

    // Header (toggle trigger)
    const header = document.createElement('div')
    header.className = 'oe-toggle__header'

    const chevron = document.createElement('button')
    chevron.type = 'button'
    chevron.className = 'oe-toggle__chevron'
    chevron.innerHTML = ICON_CHEVRON
    chevron.setAttribute('aria-label', this._t('toggleLabel', 'Show or hide content'))
    chevron.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
    chevron.setAttribute('aria-expanded', String(wrapper.classList.contains('oe-toggle--open')))
    chevron.setAttribute('aria-controls', bodyId)
    chevron.addEventListener('mousedown', (e) => e.preventDefault())
    chevron.addEventListener('click', (e) => {
      e.stopPropagation()
      const operation = () => {
        const open = wrapper.classList.toggle('oe-toggle--open')
        chevron.setAttribute('aria-expanded', String(open))
        const state = stateMap.get(wrapper)
        if (state && !state.context.readOnly) state.open = open
      }
      if (context.readOnly) operation()
      else context.mutate(operation)
    })

    const titleEl = document.createElement('div')
    titleEl.className = 'oe-toggle__title'
    titleEl.contentEditable = 'true'
    titleEl.dataset.placeholder = this._t('titlePlaceholder', 'Toggle title...')
    const title = normalizeTextValue(data?.title)
    if (title) titleEl.innerHTML = sanitizeHtml(title)
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        context.mutate(() => {
          wrapper.classList.add('oe-toggle--open')
          chevron.setAttribute('aria-expanded', 'true')
          const state = stateMap.get(wrapper)
          if (state) state.open = true
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
    body.id = bodyId
    body.contentEditable = 'true'
    body.dataset.placeholder = this._t('bodyPlaceholder', 'Hidden content...')
    const content = normalizeTextValue(data?.content)
    if (content) body.innerHTML = sanitizeHtml(content)
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.stopPropagation()
      }
    })

    wrapper.appendChild(body)

    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {{ title: string, content: string, open: boolean }}
   */
  save(element) {
    const title = element.querySelector('.oe-toggle__title')
    const body = element.querySelector('.oe-toggle__body')
    return {
      title: sanitizeHtml(title?.innerHTML?.trim() || ''),
      content: sanitizeHtml(body?.innerHTML?.trim() || ''),
      open: stateMap.get(element)?.open ?? element.classList.contains('oe-toggle--open'),
    }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data @returns {boolean}
   */
  validate(data) {
    return validateToggleData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element @returns {boolean}
   */
  isEmpty(element) {
    const title = element.querySelector('.oe-toggle__title')
    const body = element.querySelector('.oe-toggle__body')
    return !title?.textContent?.trim() && !body?.textContent?.trim()
  }

  /**
   * Extract neutral rich text that can initialize another block type.
   * @param {HTMLElement} element @returns {{ text: string }}
   */
  exportData(element) {
    const title = sanitizeHtml(element.querySelector('.oe-toggle__title')?.innerHTML?.trim() || '')
    const content = sanitizeHtml(element.querySelector('.oe-toggle__body')?.innerHTML?.trim() || '')
    return { text: [title, content].filter(Boolean).join('<br>') }
  }

  /**
   * Merge incoming text into the current block.
   * @param {HTMLElement} element
   * @param {Record<string, unknown>} data
   * @returns {void}
   */
  merge(element, data) {
    const body = element.querySelector('.oe-toggle__body')
    const text = normalizeTextValue(data?.text)
    if (body && text) {
      if (body.innerHTML.trim()) body.innerHTML += '<br>'
      body.innerHTML += sanitizeHtml(text)
      element.classList.add('oe-toggle--open')
      element.querySelector('.oe-toggle__chevron')?.setAttribute('aria-expanded', 'true')
      const state = stateMap.get(element)
      if (state) state.open = true
    }
  }

  /**
   * Release state owned by one rendered block.
   * @param {HTMLElement} element
   * @returns {void}
   */
  destroy(element) {
    stateMap.delete(element)
  }

}
