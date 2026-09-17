import { insertSanitizedHtml, setSanitizedHtml, setTrustedHtml } from '../../core/sanitize.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { createHeadingLevelSelect } from './HeadingLevelSelect.js'
import { mapTextFields } from './mapTextFields.js'
import { validateHeadingData } from '../../shared/blockDataValidators.js'
import { normalizeHeadingLevel, normalizeTextAlign, normalizeTextValue } from '../../shared/textFormat.js'

const editorStyles = new URL('./heading.css', import.meta.url).href

// Tabler icon: heading
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12h10"/><path d="M7 5v14"/><path d="M17 5v14"/><path d="M15 19h4"/><path d="M15 5h4"/><path d="M5 19h4"/><path d="M5 5h4"/></svg>'

const ICON_H2 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 12a2 2 0 1 1 4 0c0 .591-.417 1.318-.816 1.858L17 18h4"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'
const ICON_H3 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14a2 2 0 1 0 -2 -2"/><path d="M17 16a2 2 0 1 0 2 -2"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'
const ICON_H4 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 18v-8l-4 6h5"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'
// Tabler: h5
const ICON_H5 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18h2a2 2 0 1 0 0 -4h-2v-4h4"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'
// Tabler: h6
const ICON_H6 = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14a2 2 0 1 0 0 4a2 2 0 0 0 0 -4z"/><path d="M21 12a2 2 0 1 0 -4 0v4"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M11 18h2"/><path d="M3 18h2"/><path d="M4 12h8"/><path d="M3 6h2"/><path d="M11 6h2"/></svg>'

/**
 * Immutable metadata for the heading levels exposed by the plugin UI.
 * Consumers may reuse it to build controls that stay aligned with Rector's
 * supported H2-H6 range; `key` is the plugin-local localization key.
 * @type {ReadonlyArray<{ level: number, key: string, icon: string }>}
 */
export const HEADING_LEVELS = Object.freeze([
  Object.freeze({ level: 2, key: 'h2', icon: ICON_H2 }),
  Object.freeze({ level: 3, key: 'h3', icon: ICON_H3 }),
  Object.freeze({ level: 4, key: 'h4', icon: ICON_H4 }),
  Object.freeze({ level: 5, key: 'h5', icon: ICON_H5 }),
  Object.freeze({ level: 6, key: 'h6', icon: ICON_H6 }),
])

/** Editable H2-H6 heading block with alignment and inline formatting. */
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

  get title() { return this._t('title', 'Heading') }

  #placeholder(level) {
    return this._t('placeholder', `Heading ${level}`, { level })
  }

  render(data, context) {
    const ownerDocument = context?.ownerDocument ?? globalThis.document
    const level = normalizeHeadingLevel(data?.level)
    const tag = `h${level}`
    const heading = ownerDocument.createElement(tag)
    heading.classList.add('oe-heading', `oe-heading--${tag}`)
    heading.contentEditable = 'true'

    const text = normalizeTextValue(data?.text)
    if (text) setSanitizedHtml(heading, text)
    const align = normalizeTextAlign(data?.align)
    if (align) heading.style.textAlign = align

    heading.dataset.placeholder = this.#placeholder(level)
    return heading
  }

  changeLevel(element, newLevel) {
    const level = normalizeHeadingLevel(newLevel)
    const tag = `h${level}`
    if (element.tagName.toLowerCase() === tag) return element

    const ownerDocument = element.ownerDocument
    const ownerWindow = ownerDocument.defaultView
    const sel = ownerWindow?.getSelection?.()
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

    const newEl = ownerDocument.createElement(tag)
    newEl.className = `oe-heading oe-heading--${tag}`
    newEl.contentEditable = 'true'
    newEl.dataset.placeholder = this.#placeholder(level)
    newEl.style.textAlign = normalizeTextAlign(element.style.textAlign)
    while (element.firstChild) newEl.appendChild(element.firstChild)
    element.replaceWith(newEl)

    if (sel && startNode) {
      try {
        const range = ownerDocument.createRange()
        range.setStart(startNode, startOffset)
        if (!wasCollapsed && endNode) range.setEnd(endNode, endOffset)
        else range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
      } catch {
        newEl.focus()
      }
    }
    return newEl
  }

  getLevel(element) {
    const tag = element.tagName.toLowerCase()
    return parseInt(tag.charAt(1), 10) || 2
  }

  save(element) {
    const data = { text: element.innerHTML, level: this.getLevel(element) }
    if (element.style.textAlign) data.align = element.style.textAlign
    return data
  }

  validate(data) { return validateHeadingData(data) }

  merge(element, data) {
    const text = normalizeTextValue(data.text)
    if (text) insertSanitizedHtml(element, 'beforeend', text)
  }

  exportData(element) {
    const data = { text: element.innerHTML, level: this.getLevel(element) }
    if (element.style.textAlign) data.align = element.style.textAlign
    return data
  }

  isEmpty(element) {
    return (element.textContent?.trim().length ?? 0) === 0
  }

  renderSettings(element) {
    const ownerDocument = element.ownerDocument
    const currentLevel = this.getLevel(element)
    return HEADING_LEVELS.map(({ level, key, icon }) => {
      const btn = ownerDocument.createElement('li')
      btn.setAttribute('role', 'menuitem')
      btn.setAttribute('tabindex', '-1')
      btn.className = 'oe-settings-menu__item'
      if (level === currentLevel) btn.classList.add('oe-settings-menu__item--active')
      btn.dataset.level = String(level)

      const iconSpan = ownerDocument.createElement('span')
      iconSpan.className = 'oe-settings-menu__icon'
      setTrustedHtml(iconSpan, icon)
      btn.appendChild(iconSpan)

      const labelSpan = ownerDocument.createElement('span')
      labelSpan.className = 'oe-settings-menu__label'
      labelSpan.textContent = this._t(key, `Heading ${level}`)
      btn.appendChild(labelSpan)
      return btn
    })
  }

  renderInlineControls(element, ctx) {
    return createHeadingLevelSelect(this, element, ctx, (key, fallback) => this._t(key, fallback), HEADING_LEVELS)
  }

  onPaste(event) {
    if (event.type !== 'tag') return null
    const tag = event.tag.toLowerCase()
    const level = parseInt(tag.charAt(1), 10)
    if (level < 2 || level > 6) return null
    return { text: event.element.innerHTML, level }
  }
}
