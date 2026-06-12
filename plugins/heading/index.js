import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { createHeadingLevelSelect } from './HeadingLevelSelect.js'
import { mapTextFields } from './mapTextFields.js'

const editorStyles = resolvePath('./heading.css', import.meta.url)

// Tabler icon: heading
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12h10"/><path d="M7 5v14"/><path d="M17 5v14"/><path d="M15 19h4"/><path d="M15 5h4"/><path d="M5 19h4"/><path d="M5 5h4"/></svg>'

const ICON_H2 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 12a2 2 0 1 1 4 0c0 .591-.417 1.318-.816 1.858L17 18h4"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'
const ICON_H3 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14a2 2 0 1 0 -2 -2"/><path d="M17 16a2 2 0 1 0 2 -2"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'
const ICON_H4 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 18v-8l-4 6h5"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'
// Tabler: h5
const ICON_H5 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18h2a2 2 0 1 0 0 -4h-2v-4h4"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'
// Tabler: h6
const ICON_H6 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14a2 2 0 1 0 0 4a2 2 0 0 0 0 -4z"/><path d="M21 12a2 2 0 1 0 -4 0v4"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'

/** @type {ReadonlyArray<{ level: number, key: string, icon: string }>} */
const HEADING_LEVELS = [
  { level: 2, key: 'h2', icon: ICON_H2 },
  { level: 3, key: 'h3', icon: ICON_H3 },
  { level: 4, key: 'h4', icon: ICON_H4 },
  { level: 5, key: 'h5', icon: ICON_H5 },
  { level: 6, key: 'h6', icon: ICON_H6 },
]

export { HEADING_LEVELS }


export class Heading extends BlockPluginAbstract {
  static isTextBlock = true
  static styles = [editorStyles]
  type = 'heading'
  icon = ICON
  inlineTools = true
  mapTextFields = mapTextFields

  pasteConfig = {
    tags: ['h2', 'h3', 'h4', 'h5', 'h6'],
  }

  /** @returns {string} */
  get title() {
    return this._t('title', 'Heading')
  }

  /**
   * Get localized heading level title.
   * @param {number} level
   * @returns {string}
   */
  // @ts-ignore used by external callers
  #levelTitle(level) {
    const entry = HEADING_LEVELS.find(h => h.level === level)
    return entry ? this._t(entry.key, `Heading ${level}`) : `Heading ${level}`
  }

  /**
   * Get localized placeholder for heading.
   * @param {number} level
   * @returns {string}
   */
  #placeholder(level) {
    return this._t('placeholder', `Heading ${level}`, { level })
  }

  /**
   * @param {{ text?: string, level?: number, align?: string }} data
   * @returns {HTMLElement}
   */
  render(data) {
    const level = data.level || 2
    const tag = `h${Math.min(Math.max(level, 2), 6)}`
    const heading = document.createElement(tag)
    heading.classList.add('oe-heading', `oe-heading--${tag}`)
    heading.contentEditable = 'true'

    if (data.text) {
      heading.innerHTML = sanitizeHtml(data.text)
    }
    if (data.align) {
      heading.style.textAlign = data.align
    }

    heading.dataset.placeholder = this.#placeholder(level)

    return heading
  }

  /**
   * Change heading level in-place (preserves caret position).
   * Returns the new element (replaces old in DOM).
   * @param {HTMLElement} element — current heading element
   * @param {number} newLevel
   * @returns {HTMLElement}
   */
  changeLevel(element, newLevel) {
    const level = Math.min(Math.max(newLevel, 2), 6)
    const tag = `h${level}`

    // If already at this level, do nothing
    if (element.tagName.toLowerCase() === tag) return element

    // Save full selection range (not just caret) so inline tools keep working
    const sel = window.getSelection()
    let startNode = null, startOffset = 0
    let endNode = null, endOffset = 0
    let wasCollapsed = true
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      startNode = range.startContainer
      startOffset = range.startOffset
      endNode = range.endContainer
      endOffset = range.endOffset
      wasCollapsed = range.collapsed
    }

    // Create new element with same content
    const newEl = document.createElement(tag)
    newEl.className = `oe-heading oe-heading--${tag}`
    newEl.contentEditable = 'true'
    newEl.dataset.placeholder = this.#placeholder(level)

    // Move all children (nodes are moved, not cloned — refs stay valid)
    while (element.firstChild) {
      newEl.appendChild(element.firstChild)
    }

    // Replace in DOM
    element.replaceWith(newEl)

    // Restore full selection range
    if (sel && startNode) {
      try {
        const range = document.createRange()
        range.setStart(startNode, startOffset)
        if (!wasCollapsed && endNode) {
          range.setEnd(endNode, endOffset)
        } else {
          range.collapse(true)
        }
        sel.removeAllRanges()
        sel.addRange(range)
      } catch {
        // Node may be detached in edge cases — fall back to focusing element
        newEl.focus()
      }
    }

    return newEl
  }

  /**
   * Get current level from element.
   * @param {HTMLElement} element
   * @returns {number}
   */
  getLevel(element) {
    const tag = element.tagName.toLowerCase()
    return parseInt(tag.charAt(1), 10) || 2
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string, level: number, align?: string }}
   */
  save(element) {
    /** @type {{ text: string, level: number, align?: string }} */
    const data = { text: element.innerHTML.trim(), level: this.getLevel(element) }
    if (element.style.textAlign) data.align = element.style.textAlign
    return data
  }

  /**
   * @param {{ text: string, level?: number }} data
   * @returns {boolean}
   */
  validate(data) {
    return typeof data.text === 'string' && data.text.trim().length > 0
  }

  /**
   * @param {HTMLElement} element
   * @param {{ text?: string }} data
   */
  merge(element, data) {
    if (data.text) {
      element.innerHTML += sanitizeHtml(data.text)
    }
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string, level: number, align?: string }}
   */
  exportData(element) {
    /** @type {{ text: string, level: number, align?: string }} */
    const data = { text: element.innerHTML.trim(), level: this.getLevel(element) }
    if (element.style.textAlign) data.align = element.style.textAlign
    return data
  }

  /**
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    return (element.textContent?.trim().length ?? 0) === 0
  }

  /**
   * Render settings items for the block settings menu.
   * Returns H2/H3/H4 buttons shown directly in the main settings view.
   * @param {HTMLElement} element
   * @returns {HTMLElement[]}
   */
  renderSettings(element) {
    const currentLevel = this.getLevel(element)
    return HEADING_LEVELS.map(({ level, key, icon }) => {
      const btn = document.createElement('li')
      btn.setAttribute('role', 'menuitem')
      btn.setAttribute('tabindex', '-1')
      btn.className = 'oe-settings-menu__item'
      if (level === currentLevel) {
        btn.classList.add('oe-settings-menu__item--active')
      }
      btn.dataset.level = String(level)

      const iconSpan = document.createElement('span')
      iconSpan.className = 'oe-settings-menu__icon'
      iconSpan.innerHTML = icon
      btn.appendChild(iconSpan)

      const labelSpan = document.createElement('span')
      labelSpan.className = 'oe-settings-menu__label'
      labelSpan.textContent = this._t(key, `Heading ${level}`)
      btn.appendChild(labelSpan)

      return btn
    })
  }

  /**
   * Render heading level select dropdown for the inline toolbar.
   * @param {HTMLElement} element
   * @param {import('../../types').InlineControlContext} ctx
   * @returns {import('../../types').InlineControlGroup}
   */
  renderInlineControls(element, ctx) {
    return createHeadingLevelSelect(this, element, ctx, (key, fallback) => this._t(key, fallback))
  }

  /**
   * Handle pasted heading elements.
   * @param {import('../../types').TagPasteEvent} event
   * @returns {{ text: string, level: number } | null}
   */
  onPaste(event) {
    if (event.type !== 'tag') return null
    const tag = event.tag.toLowerCase()
    const level = parseInt(tag.charAt(1), 10)
    if (level < 2 || level > 6) return null
    return { text: event.element.innerHTML, level }
  }

}
