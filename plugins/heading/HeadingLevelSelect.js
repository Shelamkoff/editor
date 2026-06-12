import { getTextOffset } from '../../core/textOffset.js'
import { restoreSelectionByOffsets } from '../../core/textOffset.js'
import { HEADING_LEVELS } from './index.js'

const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>'

/**
 * Inline toolbar control for changing heading level.
 * Extracted from Heading.renderInlineControls() for SRP.
 *
 * @param {import('./index.js').Heading} plugin
 * @param {HTMLElement} element - heading content element
 * @param {import('../../../editor/core/types').InlineControlContext} ctx
 * @param {(key: string, fallback: string) => string} t - translation function
 * @returns {import('../../../editor/core/types').InlineControlGroup}
 */
export function createHeadingLevelSelect(plugin, element, ctx, t) {
  let currentLevel = plugin.getLevel(element)
  let contentEl = element
  let dropdownOpen = false

  /** @type {number | null} */
  let savedStartOffset = null
  /** @type {number | null} */
  let savedEndOffset = null

  // Select button: "H2 ▾"
  const selectBtn = document.createElement('button')
  selectBtn.type = 'button'
  selectBtn.className = 'oe-inline-toolbar__level-select'

  const label = document.createElement('span')
  label.className = 'oe-inline-toolbar__level-label'
  label.textContent = `H${currentLevel}`
  selectBtn.appendChild(label)

  const chevron = document.createElement('span')
  chevron.className = 'oe-inline-toolbar__type-chevron'
  chevron.innerHTML = ICON_CHEVRON
  selectBtn.appendChild(chevron)

  // Dropdown panel
  const dropdown = document.createElement('div')
  dropdown.className = 'oe-inline-toolbar__level-dropdown'
  dropdown.style.display = 'none'

  for (const { level, key, icon } of HEADING_LEVELS) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'oe-inline-toolbar__type-item'
    if (level === currentLevel) {
      item.classList.add('oe-inline-toolbar__type-item--active')
    }
    item.dataset.level = String(level)

    const iconSpan = document.createElement('span')
    iconSpan.className = 'oe-inline-toolbar__type-item-icon'
    iconSpan.innerHTML = icon
    item.appendChild(iconSpan)

    const labelSpan = document.createElement('span')
    labelSpan.className = 'oe-inline-toolbar__type-item-label'
    labelSpan.textContent = t(key, `Heading ${level}`)
    item.appendChild(labelSpan)

    item.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    item.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()

      const textLen = contentEl.textContent?.length ?? 0
      const startOff = savedStartOffset ?? 0
      const endOff = savedEndOffset ?? textLen

      ctx.suppressSelectionChange()
      const newEl = plugin.changeLevel(contentEl, level)
      if (newEl !== contentEl) {
        contentEl = newEl
        ctx.onContentElementChanged(newEl)
      }
      currentLevel = level
      label.textContent = `H${level}`

      restoreSelectionByOffsets(contentEl, startOff, endOff)
      saveRange()

      // Update active states in dropdown
      for (const btn of dropdown.children) {
        const lvl = parseInt(/** @type {HTMLElement} */ (btn).dataset.level || '0', 10)
        btn.classList.toggle('oe-inline-toolbar__type-item--active', lvl === level)
      }

      closeDropdown()
      contentEl.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })

    dropdown.appendChild(item)
  }

  // Toggle dropdown
  selectBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  selectBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (dropdownOpen) {
      closeDropdown()
    } else {
      openDropdown()
    }
  })

  function saveRange() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      savedStartOffset = getTextOffset(contentEl, range.startContainer, range.startOffset)
      savedEndOffset = getTextOffset(contentEl, range.endContainer, range.endOffset)
    }
  }

  function openDropdown() {
    saveRange()
    dropdownOpen = true
    dropdown.style.display = ''
  }

  function closeDropdown() {
    dropdownOpen = false
    dropdown.style.display = 'none'
  }

  // Close on outside click
  const onOutsideClick = (/** @type {MouseEvent} */ e) => {
    if (!dropdownOpen) return
    const target = /** @type {Node} */ (e.target)
    if (selectBtn.contains(target) || dropdown.contains(target)) return
    closeDropdown()
  }
  document.addEventListener('mousedown', onOutsideClick, true)

  return {
    elements: [selectBtn, dropdown],
    destroy() {
      document.removeEventListener('mousedown', onOutsideClick, true)
    },
  }
}
