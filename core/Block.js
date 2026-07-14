import { uid } from './uid.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
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
  /** @type {Record<string, unknown> | null} */
  #cachedData = null
  /** @type {boolean} */
  #dirty = true
  /** @type {number} */
  #version = 0
  #readOnly

  /** @type {Record<string, unknown> | undefined} */
  #tunes

  /** @type {string | number | undefined} */
  #revision

  /** @type {Record<string, import('../renderer/types').InlineWidget> | undefined} */
  #preservedInline

  /** @type {import('./CommandDispatcher').CommandDispatcher} */
  #commands

  /** @type {boolean} */
  #destroyed = false

  /**
   * @param {import('./types').BlockPlugin} plugin
   * @param {Record<string, unknown>} [data]
   * @param {string} [id]
   * @param {boolean} [readOnly]
   * @param {import('./CommandDispatcher').CommandDispatcher} commands
   * @param {{ tunes?: Record<string, unknown>, revision?: string | number, inline?: Record<string, import('../renderer/types').InlineWidget>, preserveInline?: boolean }} [metadata]
   */
  constructor(plugin, data, id, readOnly = false, commands, metadata = {}) {
    this.#id = id || uid()
    this.#type = plugin.type
    this.#plugin = plugin
    this.#readOnly = readOnly
    this.#commands = commands
    this.#tunes = metadata.tunes === undefined ? undefined : cloneEditorData(metadata.tunes)
    this.#revision = metadata.revision
    this.#preservedInline = metadata.preserveInline && metadata.inline
      ? cloneEditorData(metadata.inline)
      : undefined

    this.#element = el('div', BLOCK_CLASS, {
      'data-block-id': this.#id,
      'data-block-type': this.#type,
    })

    const contentElement = plugin.render(data || {}, {
      mutate: (operation) => this.#runMutation(operation),
      readOnly: this.#readOnly,
    })
    if (!(contentElement instanceof HTMLElement)) {
      throw new TypeError(`Block plugin "${this.#type}" render() must return an HTMLElement`)
    }
    this.#contentElement = contentElement
    this.#applyReadOnly()
    this.#element.appendChild(this.#contentElement)
  }

  /**
   * Core-owned command boundary for interactive block-plugin controls.
   * Plugins mutate their own DOM, while the Block remains responsible for
   * cache invalidation, change events, and the final history commit.
   * @template T
   * @param {() => T} operation
   * @returns {T | undefined}
   */
  #runMutation(operation) {
    if (this.#destroyed || this.#readOnly) return undefined
    return this.#commands.runForBlock(this, operation)
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
    if (this.#dirty || !this.#cachedData) {
      const saved = this.#plugin.save(this.#contentElement)
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        throw new TypeError(`Block plugin "${this.#type}" save() must return a data object`)
      }
      this.#cachedData = cloneEditorData(saved)
      this.#dirty = false
    }
    const data = cloneEditorData(this.#cachedData)
    const result = { id: this.#id, type: this.#type, data }
    if (this.#revision !== undefined) result.revision = this.#revision
    if (this.#tunes !== undefined) result.tunes = cloneEditorData(this.#tunes)
    if (this.#preservedInline !== undefined) result.inline = cloneEditorData(this.#preservedInline)
    return result
  }

  /** Mark cached serialization stale after a block-local mutation. */
  markDirty() {
    this.#dirty = true
    // A producer-owned revision only describes the input block. Once the
    // editor changes that block it can no longer claim the old revision.
    this.#revision = undefined
    this.#version++
  }

  /** Monotonic version used by incremental consumers. */
  get version() {
    return this.#version
  }

  /**
   * Merge another block's data into this one.
   * @param {Record<string, unknown>} data
   */
  merge(data) {
    if (this.#plugin.merge) {
      this.#plugin.merge(this.#contentElement, data)
    }
    this.markDirty()
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
    const setting = this.#plugin.inlineTools
    return setting !== false && (!Array.isArray(setting) || setting.length > 0)
  }

  /**
   * Tool types allowed by this block, or null when the editor-wide set applies.
   * @returns {readonly string[] | null}
   */
  get inlineToolTypes() {
    return Array.isArray(this.#plugin.inlineTools)
      ? this.#plugin.inlineTools
      : null
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
      this.markDirty()
      // Plugin already performed the DOM swap; just track the new ref.
      this.#contentElement = newEl
      return
    }
    this.#element.replaceChild(newEl, this.#contentElement)
    this.markDirty()
    this.#contentElement = newEl
  }


  /**
   * Enforce read-only as a DOM invariant instead of relying on pointer events.
   */
  #applyReadOnly() {
    if (!this.#readOnly) return

    this.#contentElement.setAttribute('aria-readonly', 'true')
    const editables = [
      ...(this.#contentElement.matches('[contenteditable]') ? [this.#contentElement] : []),
      ...this.#contentElement.querySelectorAll('[contenteditable]'),
    ]
    for (const editable of editables) {
      /** @type {HTMLElement} */ (editable).contentEditable = 'false'
    }

    const fields = this.#contentElement.querySelectorAll('input, textarea')
    for (const field of fields) {
      /** @type {HTMLInputElement | HTMLTextAreaElement} */ (field).readOnly = true
    }
    for (const control of this.#contentElement.querySelectorAll('button, select')) {
      /** @type {HTMLButtonElement | HTMLSelectElement} */ (control).disabled = true
    }
  }

  /**
   * Clean up the plugin without removing the block element from DOM.
   * Used by BlockManager.convert() which handles element removal separately.
   */
  disposePlugin() {
    if (this.#destroyed) return
    this.#destroyed = true
    if (this.#plugin.destroy) {
      try {
        this.#plugin.destroy(this.#contentElement)
      } catch (err) {
        console.warn(`[Block] Plugin destroy failed for ${this.#id} (${this.#type}):`, err)
      }
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
    this.disposePlugin()
  }
}
