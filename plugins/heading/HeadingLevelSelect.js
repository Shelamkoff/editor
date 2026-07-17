import { getTextOffset } from '../../core/textOffset.js'
import { restoreSelectionByOffsets } from '../../core/textOffset.js'
import { handleMenuKeydown } from '../../core/menuKeyboardNav.js'

const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>'

/**
 * Inline toolbar control for changing heading level.
 * Extracted from Heading.renderInlineControls() for SRP.
 *
 * @param {import('./index.js').Heading} plugin
 * @param {HTMLElement} element - heading content element
 * @param {import('../../core/types').InlineControlContext} ctx
 * @param {(key: string, fallback: string) => string} t - translation function
 * @param {ReadonlyArray<{level: number, key: string, icon: string}>} levels
 * @returns {import('../../core/types').InlineControlGroup}
 */
export function createHeadingLevelSelect(plugin, element, ctx, t, levels) {
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
  selectBtn.setAttribute('aria-label', t('level', 'Heading level'))
  selectBtn.setAttribute('aria-haspopup', 'menu')
  selectBtn.setAttribute('aria-expanded', 'false')

  const label = document.createElement('span')
  label.className = 'oe-inline-toolbar__level-label'
  label.textContent = `H${currentLevel}`
  selectBtn.appendChild(label)

  const chevron = document.createElement('span')
  chevron.className = 'oe-inline-toolbar__type-chevron'
  chevron.setAttribute('aria-hidden', 'true')
  chevron.innerHTML = ICON_CHEVRON
  selectBtn.appendChild(chevron)

  // Dropdown panel
  const dropdown = document.createElement('div')
  dropdown.className = 'oe-inline-toolbar__level-dropdown'
  dropdown.setAttribute('role', 'menu')
  dropdown.style.display = 'none'

  for (const { level, key, icon } of levels) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'oe-inline-toolbar__type-item'
    item.setAttribute('role', 'menuitemradio')
    item.setAttribute('aria-checked', String(level === currentLevel))
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

      ctx.mutate(() => {
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
          btn.setAttribute('aria-checked', String(lvl === level))
        }
      })

      closeDropdown()
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
  selectBtn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    e.stopPropagation()
    if (!dropdownOpen) openDropdown()
    const items = [...dropdown.querySelectorAll('[role="menuitemradio"]')]
    const target = e.key === 'ArrowUp' ? items.at(-1) : items[0]
    if (target instanceof HTMLElement) target.focus()
  })
  dropdown.addEventListener('keydown', (e) => {
    handleMenuKeydown(e, dropdown, {
      itemSelector: '[role="menuitemradio"]',
      onEscape: () => {
        closeDropdown()
        selectBtn.focus()
      },
    })
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
    selectBtn.setAttribute('aria-expanded', 'true')
  }

  function closeDropdown() {
    dropdownOpen = false
    dropdown.style.display = 'none'
    selectBtn.setAttribute('aria-expanded', 'false')
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
