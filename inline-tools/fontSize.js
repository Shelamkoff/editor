import { el } from '../core/dom.js'
import { createSvgIcon } from '../core/icons.js'
import {
  ICON_CHECK,
  getContentEditable,
  getWalkRoot,
  collectTextTargets,
  normalizeAfterEdit,
  saveSelectionOffsets,
  restoreSelectionOffsets,
  toggleTag,
} from './utils.js'

/** Preset font sizes in px */
const FONT_SIZE_PRESETS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64]
const FONT_SIZE_DEFAULT = 16
const FONT_SIZE_MIN = 1
const FONT_SIZE_MAX = 200

const ICON_CHEVRON_SM = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>'

/**
 * Find the closest <span> with inline font-size on the selection anchor.
 * @param {Range | null} [rangeHint] - optional range to check instead of live selection
 * @returns {HTMLElement | null}
 */
function findFontSizeSpan(rangeHint) {
  let node
  if (rangeHint) {
    const sc = rangeHint.startContainer
    if (sc.nodeType === Node.ELEMENT_NODE) {
      const element = /** @type {HTMLElement} */ (sc)
      const child = element.childNodes[Math.min(rangeHint.startOffset, element.childNodes.length - 1)]
      node = child?.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (child)
        : child?.parentElement ?? element
    } else {
      node = sc.parentElement
    }
  } else {
    const sel = window.getSelection()
    if (!sel || !sel.anchorNode) return null
    const anchor = sel.anchorNode
    if (anchor.nodeType === Node.ELEMENT_NODE) {
      // When anchorNode is an element, resolve to the actual child at anchorOffset.
      // Clamp offset to valid range to avoid undefined when offset equals childNodes.length.
      const children = /** @type {HTMLElement} */ (anchor).childNodes
      const clampedOffset = Math.min(sel.anchorOffset, children.length - 1)
      const child = clampedOffset >= 0 ? children[clampedOffset] : null
      node = child?.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (child)
        : child?.parentElement ?? /** @type {HTMLElement} */ (anchor)
    } else {
      node = anchor.parentElement
    }
  }
  while (node) {
    if (node.tagName === 'SPAN' && node.style.fontSize) return node
    if (node.getAttribute && node.getAttribute('contenteditable') === 'true') break
    node = node.parentElement
  }
  return null
}

/**
 * Get current font size in px from selection or a saved range.
 * @param {Range | null} [rangeHint]
 * @returns {number}
 */
function getCurrentFontSize(rangeHint) {
  const span = findFontSizeSpan(rangeHint)
  if (span) return parseInt(span.style.fontSize, 10) || FONT_SIZE_DEFAULT
  return FONT_SIZE_DEFAULT
}

/**
 * Safely wrap the selected range in a <span> with font-size.
 * Uses per-text-node wrapping when surroundContents fails (cross-element selection).
 * If a text node's parent is already a font-size span, updates it instead of nesting.
 * @param {Range} range
 * @param {string} fontSize — e.g. "24px"
 * @returns {{ firstSpan: HTMLElement, lastSpan: HTMLElement } | null}
 */
function wrapRangeWithFontSize(range, fontSize) {
  const span = document.createElement('span')
  span.style.fontSize = fontSize

  // Fast path: selection doesn't cross element boundaries
  try {
    range.surroundContents(span)
    return { firstSpan: span, lastSpan: span }
  } catch {
    // surroundContents failed — wrap individual text nodes
  }

  const walkRoot = getWalkRoot(range)
  if (!walkRoot) return null

  const targets = collectTextTargets(walkRoot, range)

  /** @type {HTMLElement | null} */
  let firstSpan = null
  /** @type {HTMLElement | null} */
  let lastSpan = null

  // Wrap collected nodes (iterate in reverse to preserve offsets)
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i]
    if (!t) continue
    const { node, startOffset, endOffset } = t

    // Split text node to isolate the selected portion
    let targetNode = node
    if (endOffset < node.length) {
      node.splitText(endOffset)
    }
    if (startOffset > 0) {
      targetNode = /** @type {Text} */ (node.splitText(startOffset))
    }

    // If parent is already a font-size span, just update its size
    /** @type {HTMLElement} */
    let currentSpan
    const parentEl = targetNode.parentElement
    if (parentEl?.tagName === 'SPAN' && parentEl.style.fontSize) {
      parentEl.style.fontSize = fontSize
      currentSpan = parentEl
    } else {
      const wrapper = document.createElement('span')
      wrapper.style.fontSize = fontSize
      targetNode.parentNode?.insertBefore(wrapper, targetNode)
      wrapper.appendChild(targetNode)
      currentSpan = wrapper
    }

    if (!lastSpan) lastSpan = currentSpan
    firstSpan = currentSpan
  }

  if (!firstSpan || !lastSpan) return null
  return { firstSpan, lastSpan }
}

/**
 * Create font size inline tool as a select-style dropdown.
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createFontSizeTool(label, cbs = null) {
  /** @type {HTMLElement | null} */
  let selectBtn = null
  /** @type {HTMLElement | null} */
  let sizeLabel = null
  /** @type {HTMLElement | null} */
  let dropdownEl = null
  /** @type {HTMLInputElement | null} */
  let inputEl = null
  /** @type {Range | null} */
  let savedRange = null
  let isOpen = false
  /** @type {number | null} */
  let focusFrame = null
  /** @type {import('../core/types').InlineMutationContext | null} */
  let mutations = null

  /**
   * @template T
   * @param {Range} range
   * @param {() => T} operation
   * @returns {T}
   */
  function mutate(range, operation) {
    return mutations ? mutations.mutate(range, operation) : operation()
  }

  function updateLabel() {
    if (!sizeLabel) return
    // Use cross-block range if available (native selection is clipped).

    const crossRange = cbs?.range
    const hint = crossRange || (isOpen ? savedRange : null)
    sizeLabel.textContent = getCurrentFontSize(hint) + 'px'
  }

  function openDropdown() {
    if (!dropdownEl || !inputEl) return
    savedRange = null
    const cbsRange = cbs?.range
    if (cbsRange) {
      savedRange = cbsRange.cloneRange()
    } else {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        savedRange = sel.getRangeAt(0).cloneRange()
      }
    }
    if (!savedRange) return

    isOpen = true
    dropdownEl.style.display = ''
    updateActiveItem()


    const crossRange = cbs?.range
    const currentSize = getCurrentFontSize(crossRange || savedRange)
    if (inputEl) {
      inputEl.value = String(currentSize)
      if (focusFrame !== null) cancelAnimationFrame(focusFrame)
      focusFrame = requestAnimationFrame(() => {
        focusFrame = null
        if (!isOpen || !inputEl?.isConnected) return
        inputEl.focus()
        inputEl.select()
      })
    }
  }

  function closeDropdown() {
    if (!isOpen) return
    isOpen = false
    if (focusFrame !== null) {
      cancelAnimationFrame(focusFrame)
      focusFrame = null
    }
    if (dropdownEl) dropdownEl.style.display = 'none'
    restoreRange()
  }

  function restoreRange() {
    if (!savedRange) return
    const sel = window.getSelection()
    if (!sel) return
    try {
      const root = savedRange.startContainer.getRootNode()
      if (!(root instanceof Document)) return
      const start = savedRange.startContainer
      const startElement = start.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (start)
        : start.parentElement
      const editable = startElement?.closest('[contenteditable="true"]')
      if (editable instanceof HTMLElement) editable.focus({ preventScroll: true })
      sel.removeAllRanges()
      sel.addRange(savedRange)
    } catch {
      // Range is detached — don't touch selection
    }
  }

  /** Update savedRange to reflect the current selection (after DOM ops). */
  function snapshotCurrentRange() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      savedRange = sel.getRangeAt(0).cloneRange()
    }
  }

  function updateActiveItem() {
    if (!dropdownEl) return

    const crossRange = cbs?.range
    const currentPx = getCurrentFontSize(crossRange || savedRange)

    const items = dropdownEl.querySelectorAll('[data-size]')
    for (const item of items) {
      const val = Number(/** @type {HTMLElement} */ (item).dataset.size)
      item.classList.toggle('oe-font-size-item--active', val === currentPx)
    }
  }

  /**
   * Apply font-size to saved selection.
   * @param {number} sizePx
   */
  function applySize(sizePx) {
    if (!Number.isInteger(sizePx) || sizePx < FONT_SIZE_MIN || sizePx > FONT_SIZE_MAX) return
    restoreRange()
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) { closeDropdown(); return }
    const range = sel.getRangeAt(0)

    if (sizePx === FONT_SIZE_DEFAULT) {
      removeSize()
      return
    }

    // Use the stored cross-block range if available (native range is clipped)

    const actualRange = cbs?.range?.cloneRange() || range
    const saved = saveSelectionOffsets(actualRange)

    mutate(actualRange, () => {
      // Always use wrapRangeWithFontSize — it handles both existing spans (update)
      // and unwrapped text (create new spans) in a single pass.
      const result = wrapRangeWithFontSize(actualRange, `${sizePx}px`)
      if (result) {
        const startCe = result.firstSpan.closest('[contenteditable]')
        const endCe = result.lastSpan.closest('[contenteditable]')
        if (startCe) startCe.normalize()
        if (endCe && endCe !== startCe) endCe.normalize()
      }

      restoreSelectionOffsets(cbs, saved)
    })
    snapshotCurrentRange()
    updateLabel()
    closeDropdown()
  }

  function removeSize() {
    restoreRange()
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) { closeDropdown(); return }
    const range = sel.getRangeAt(0)

    const actualRange = cbs?.range?.cloneRange() || range
    const saved = saveSelectionOffsets(actualRange)

    const walkRoot = getWalkRoot(actualRange)
    if (!walkRoot) { closeDropdown(); return }

    const spans = walkRoot.querySelectorAll('span')
    const toReset = []
    for (const span of spans) {
      if (span.style.fontSize && actualRange.intersectsNode(span)) {
        toReset.push(span)
      }
    }

    if (!toReset.length) { closeDropdown(); return }

    mutate(actualRange, () => {
      // Move font-size into a temporary dedicated wrapper. This lets the
      // range splitter remove only the selected portion while every other
      // style/class/data attribute remains on the original span.
      for (let index = toReset.length - 1; index >= 0; index--) {
        const span = /** @type {HTMLElement} */ (toReset[index])
        if (!span.isConnected) continue
        const marker = document.createElement('oe-font-size')
        marker.style.fontSize = span.style.fontSize
        span.style.removeProperty('font-size')
        if (!span.getAttribute('style')) span.removeAttribute('style')
        while (span.firstChild) marker.appendChild(span.firstChild)
        if (span.attributes.length === 0) span.replaceWith(marker)
        else span.appendChild(marker)
      }

      restoreSelectionOffsets(cbs, saved)
      for (let guard = 0; guard < 100; guard++) {
        const selection = window.getSelection()
        const current = cbs?.range || (selection?.rangeCount ? selection.getRangeAt(0) : null)
        if (!current) break
        const currentRoot = getWalkRoot(current)
        const hasMarker = !!currentRoot && Array.from(currentRoot.querySelectorAll('oe-font-size'))
          .some(marker => current.intersectsNode(marker))
        if (!hasMarker) break
        toggleTag('oe-font-size', current)
        restoreSelectionOffsets(cbs, saved)
      }

      for (const marker of walkRoot.querySelectorAll('oe-font-size')) {
        const span = document.createElement('span')
        span.style.fontSize = /** @type {HTMLElement} */ (marker).style.fontSize
        while (marker.firstChild) span.appendChild(marker.firstChild)
        marker.replaceWith(span)
      }

      normalizeAfterEdit(getContentEditable(actualRange), walkRoot)

      restoreSelectionOffsets(cbs, saved)
    })
    snapshotCurrentRange()
    updateLabel()
    closeDropdown()
  }

  /** @param {HTMLElement} toolbarRoot */
  function buildDropdown(toolbarRoot) {
    dropdownEl = el('div', 'oe-font-size-dropdown')
    dropdownEl.style.display = 'none'

    dropdownEl.addEventListener('mousedown', (e) => {
      if (e.target === inputEl) return
      e.preventDefault()
      e.stopPropagation()
    })

    // Custom input row
    const inputRow = el('div', 'oe-font-size-input-row')
    inputEl = /** @type {HTMLInputElement} */ (document.createElement('input'))
    inputEl.type = 'number'
    inputEl.className = 'oe-font-size-input'
    inputEl.placeholder = 'px'
    inputEl.setAttribute('aria-label', `${label}, px`)
    inputEl.min = String(FONT_SIZE_MIN)
    inputEl.max = String(FONT_SIZE_MAX)
    inputEl.addEventListener('keydown', (e) => {
      // Stop ALL key events from reaching KeyboardManager (which would
      // interpret Delete/Backspace as block merge, arrows as navigation, etc.)
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        const val = Number(/** @type {HTMLInputElement} */ (inputEl).value)
        applySize(val)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeDropdown()
      }
    })
    // Prevent input/change events from bubbling to wireInputTracking
    // (which would emit editor:changed and trigger undo snapshots).
    inputEl.addEventListener('input', (e) => e.stopPropagation())

    const applyBtn = el('button', 'oe-font-size-apply', { type: 'button' })
    applyBtn.setAttribute('aria-label', label)
    applyBtn.innerHTML = ICON_CHECK
    applyBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const val = Number(/** @type {HTMLInputElement} */ (inputEl).value)
      applySize(val)
    })

    const resetBtn = el('button', 'oe-font-size-reset', { type: 'button' })
    resetBtn.setAttribute('aria-label', `${label}: 16px`)
    resetBtn.innerHTML = createSvgIcon('<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>', 14)
    resetBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      removeSize()
    })

    inputRow.appendChild(inputEl)
    inputRow.appendChild(applyBtn)
    inputRow.appendChild(resetBtn)
    dropdownEl.appendChild(inputRow)

    // Preset list. Each action is a native button so presets are reachable
    // without a pointer and participate in the browser's focus order.
    const list = el('ul', 'oe-font-size-list')
    for (const size of FONT_SIZE_PRESETS) {
      const row = document.createElement('li')
      const item = el('button', 'oe-font-size-item', { type: 'button', 'data-size': String(size) })
      item.textContent = size + 'px'
      item.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        applySize(size)
      })
      row.appendChild(item)
      list.appendChild(row)
    }
    dropdownEl.appendChild(list)

    toolbarRoot.appendChild(dropdownEl)
  }

  /** @param {MouseEvent} e */
  function onDocMouseDown(e) {
    if (!isOpen) return
    if (dropdownEl && dropdownEl.contains(/** @type {Node} */ (e.target))) return
    if (selectBtn && selectBtn.contains(/** @type {Node} */ (e.target))) return
    closeDropdown()
  }

  return {
    type: 'fontSize',
    title: label,
    icon: '',
    tag: 'span',

    /** Used by InlineToolbar to avoid hiding while dropdown is open */
    isDropdownOpen() {
      return isOpen
    },

    isActive() {
      if (isOpen && dropdownEl && !dropdownEl.offsetParent) {
        isOpen = false
        dropdownEl.style.display = 'none'
      }
      // Side-effect: update the displayed font-size value.
      // Called by InlineToolbar.#updateActiveStates on every selection change.
      updateLabel()
      return !!findFontSizeSpan()
    },

    toggle(_selection) {
      if (isOpen) {
        closeDropdown()
      } else {
        openDropdown()
      }
    },

    onMount(button, mutationContext) {
      mutations = mutationContext ?? null
      button.classList.add('oe-font-size-select')
      button.innerHTML = ''

      sizeLabel = el('span', 'oe-font-size-select__value')
      sizeLabel.textContent = FONT_SIZE_DEFAULT + 'px'
      button.appendChild(sizeLabel)

      const chevron = el('span', 'oe-font-size-select__chevron')
      chevron.innerHTML = ICON_CHEVRON_SM
      button.appendChild(chevron)

      selectBtn = button

      const toolbar = /** @type {HTMLElement | null} */ (button.closest('.oe-inline-toolbar'))
      if (toolbar) buildDropdown(toolbar)
      document.addEventListener('mousedown', onDocMouseDown, true)
    },

    destroy() {
      document.removeEventListener('mousedown', onDocMouseDown, true)
      if (focusFrame !== null) cancelAnimationFrame(focusFrame)
      focusFrame = null
      if (dropdownEl) { dropdownEl.remove(); dropdownEl = null }
      mutations = null
    },
  }
}
