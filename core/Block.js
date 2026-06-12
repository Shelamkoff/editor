import { uid } from './uid.js'
import { el } from './dom.js'
import { BLOCK_CLASS } from './constants.js'

export class Block {
  /** @type {string} */
  #id

  /** @type {string} */
  #type

  /** @type {import('./types').BlockPlugin} */
  #plugin

  /** @type {HTMLElement} wrapper div.oe-block */
  #element

  /** @type {HTMLElement} inner element from plugin.render() */
  #contentElement

  /** @type {boolean} */
  #focused = false

  /** @type {boolean} */
  #selected = false

  /**
   * @param {import('./types').BlockPlugin} plugin
   * @param {Record<string, unknown>} [data]
   * @param {string} [id]
   */
  constructor(plugin, data, id) {
    this.#id = id || uid()
    this.#type = plugin.type
    this.#plugin = plugin

    this.#element = el('div', BLOCK_CLASS, {
      'data-block-id': this.#id,
      'data-block-type': this.#type,
    })

    this.#contentElement = plugin.render(data || {})
    this.#element.appendChild(this.#contentElement)
  }

  get id() {
    return this.#id
  }

  get type() {
    return this.#type
  }

  get plugin() {
    return this.#plugin
  }

  get element() {
    return this.#element
  }

  get contentElement() {
    return this.#contentElement
  }

  get focused() {
    return this.#focused
  }

  set focused(value) {
    this.#focused = value
    this.#element.classList.toggle('oe-block--focused', value)
  }

  get selected() {
    return this.#selected
  }

  set selected(value) {
    this.#selected = value
    this.#element.classList.toggle('oe-block--selected', value)
  }

  /**
   * Extract block data from DOM.
   * @returns {import('./types').BlockData}
   */
  save() {
    const data = this.#plugin.save(this.#contentElement)
    return { id: this.#id, type: this.#type, data }
  }

  /**
   * Merge another block's data into this one.
   * @param {Record<string, unknown>} data
   */
  merge(data) {
    if (this.#plugin.merge) {
      this.#plugin.merge(this.#contentElement, data)
    }
  }

  /**
   * Whether this block's plugin supports merge.
   * @returns {boolean}
   */
  get canMerge() {
    return typeof this.#plugin.merge === 'function'
  }

  /**
   * Check if the block content is empty.
   * Delegates to plugin.isEmpty() if defined, else checks textContent.
   * @returns {boolean}
   */
  isEmpty() {
    if (typeof this.#plugin.isEmpty === 'function') {
      return this.#plugin.isEmpty(this.#contentElement)
    }
    const text = this.#contentElement.textContent?.trim() ?? ''
    return text.length === 0
  }

  /**
   * Check if the plugin supports inline tools.
   * @returns {boolean}
   */
  get hasInlineTools() {
    return this.#plugin.inlineTools !== false
  }

  /**
   * Get the block's settings UI (if plugin provides one).
   * @returns {HTMLElement | HTMLElement[] | null}
   */
  renderSettings() {
    return this.#plugin.renderSettings?.(this.#contentElement) ?? null
  }

  /**
   * Adopt a new content element as this block's content.
   *
   * Two paths, automatically chosen:
   *  1. The plugin already swapped the DOM itself (`oldEl.replaceWith(newEl)`),
   *     so `newEl` is already a child of `#element` — we only need to update
   *     the internal reference. This is the case for Heading.changeLevel.
   *  2. The plugin returned a fresh detached element — we swap it in via
   *     `replaceChild`.
   *
   * Without the first branch, calling this after an in-place plugin swap
   * throws `NotFoundError: replaceChild — node is not a child of this node`,
   * because the old contentElement is already detached.
   *
   * @param {HTMLElement} newEl
   */
  replaceContentElement(newEl) {
    if (newEl === this.#contentElement) return
    if (newEl.parentNode === this.#element) {
      // Plugin already performed the DOM swap; just track the new ref.
      this.#contentElement = newEl
      return
    }
    this.#element.replaceChild(newEl, this.#contentElement)
    this.#contentElement = newEl
  }

  /**
   * Clean up the plugin without removing the block element from DOM.
   * Used by BlockManager.convert() which handles element removal separately.
   */
  disposePlugin() {
    if (this.#plugin.destroy) {
      this.#plugin.destroy(this.#contentElement)
    }
  }

  /**
   * Focus the first editable or focusable element within the block.
   */
  focus() {
    if (this.#contentElement.contentEditable === 'true' || this.#contentElement.tabIndex >= 0) {
      this.#contentElement.focus()
      return
    }
    const editable = this.#contentElement.querySelector('[contenteditable="true"]')
    if (editable) {
      /** @type {HTMLElement} */ (editable).focus()
      return
    }
    const focusable = this.#contentElement.querySelector('input, textarea, [tabindex]')
    if (focusable) {
      /** @type {HTMLElement} */ (focusable).focus()
      return
    }
    this.#contentElement.setAttribute('tabindex', '-1')
    this.#contentElement.focus()
  }

  /**
   * Clean up plugin resources. Does NOT remove the element from DOM —
   * BlockAnimator handles animated removal separately.
   */
  destroy() {
    if (this.#plugin.destroy) {
      this.#plugin.destroy(this.#contentElement)
    }
  }
}
