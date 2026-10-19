import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'
import { el } from '../shared/editorDom.js'
import { createSvgIcon } from '../shared/editorIcons.js'
import {
  createSelectionPortBinding,
  ICON_CHECK,
  getContentEditable,
  getWalkRoot,
  collectTextTargets,
  normalizeAfterEdit,
  toggleTag,
} from './utils.js'

/** Preset font sizes in px */
const FONT_SIZE_PRESETS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64]
const FONT_SIZE_DEFAULT = 16
const FONT_SIZE_MIN = 1
const FONT_SIZE_MAX = 200
const ELEMENT_NODE = 1

const ICON_CHEVRON_SM = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>'

/**
 * Find the closest <span> with inline font-size on the selection anchor.
 * @param {Range | null} [rangeHint] - optional range to check instead of live selection
 * @param {Document | null} [ownerDocument] - owning editor document for live selection
 * @returns {HTMLElement | null}
 */
function findFontSizeSpan(rangeHint, ownerDocument = rangeHint?.startContainer?.ownerDocument ?? null) {
  let node
  if (rangeHint) {
    const sc = rangeHint.startContainer
    if (sc.nodeType === ELEMENT_NODE) {
      const element = /** @type {HTMLElement} */ (sc)
      const child = element.childNodes[Math.min(rangeHint.startOffset, element.childNodes.length - 1)]
      node = child?.nodeType === ELEMENT_NODE
        ? /** @type {HTMLElement} */ (child)
        : child?.parentElement ?? element
    } else {
      node = sc.parentElement
    }
  } else {
    const sel = ownerDocument?.defaultView?.getSelection?.()
    if (!sel || !sel.anchorNode) return null
    const anchor = sel.anchorNode
    if (anchor.nodeType === ELEMENT_NODE) {
      // When anchorNode is an element, resolve to the actual child at anchorOffset.
      // Clamp offset to valid range to avoid undefined when offset equals childNodes.length.
      const children = /** @type {HTMLElement} */ (anchor).childNodes
      const clampedOffset = Math.min(sel.anchorOffset, children.length - 1)
      const child = clampedOffset >= 0 ? children[clampedOffset] : null
      node = child?.nodeType === ELEMENT_NODE
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
 * @param {Document | null} [ownerDocument]
 * @returns {number}
 */
function getCurrentFontSize(rangeHint, ownerDocument) {
  const span = findFontSizeSpan(rangeHint, ownerDocument)
  if (span) return parseInt(span.style.fontSize, 10) || FONT_SIZE_DEFAULT
  return FONT_SIZE_DEFAULT
}

/**
 * Safely wrap the selected range in a <span> with font-size.
 * Wraps editable text nodes so enclosed explicit sizes are actually overridden.
 * If a text node's parent is already a font-size span, updates it instead of nesting.
 * @param {Range} range
 * @param {string} fontSize — e.g. "24px"
 * @returns {{ firstSpan: HTMLElement, lastSpan: HTMLElement } | null}
 */
function wrapRangeWithFontSize(range, fontSize) {
  // Format editable text at its own boundary. An outer surroundContents span
  // cannot override sizes on enclosed descendants and also styles widgets.
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

    // Update an existing span only when it contains exactly the selected node.
    // Splitting a Text node alone does not split its parent styling boundary.
    /** @type {HTMLElement} */
    let currentSpan
    const parentEl = targetNode.parentElement
    if (parentEl?.tagName === 'SPAN' && parentEl.style.fontSize
        && parentEl.childNodes.length === 1 && parentEl.firstChild === targetNode) {
      parentEl.style.fontSize = fontSize
      currentSpan = parentEl
    } else {
      const wrapper = targetNode.ownerDocument.createElement('span')
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
 * @returns {import('./types').InlineTool}
 */
export function createFontSizeTool(label) {
  const selection = createSelectionPortBinding()
  const cbs = selection.port
  /** @type {HTMLElement | null} */
  let selectBtn = null
  /** @type {HTMLElement | null} */
  let sizeLabel = null
  /** @type {HTMLElement | null} */
  let dropdownEl = null
  /** @type {HTMLInputElement | null} */
  let inputEl = null
  /** @type {import('./types').InlineSelectionBookmark | null} */
  let savedBookmark = null
  /** @type {Document | null} */
  let ownerDocument = null
  /** @type {(Window & typeof globalThis) | null} */
  let ownerWindow = null
  let isOpen = false
  /** @type {number | null} */
  let focusFrame = null
  /** @type {import('./types').InlineMutationContext | null} */
  let mutations = null

  /** @param {Range | null} [range] @returns {Document | null} */
  function documentFor(range = null) {
    return range?.startContainer?.ownerDocument ?? ownerDocument
  }

  function cancelFocusFrame() {
    if (focusFrame === null) return
    const view = dropdownEl?.ownerDocument?.defaultView ?? ownerWindow
    view?.cancelAnimationFrame?.(focusFrame)
    focusFrame = null
  }

  /** @param {(range:Range)=>void} operation */
  function mutate(operation) {
    if (!savedBookmark || !mutations) return false
    let ran = false
    mutations.mutate(savedBookmark, range => {
      operation(range)
      ran = true
    })
    return ran
  }

  function updateLabel() {
    if (!sizeLabel) return
    const range = cbs.range
    sizeLabel.textContent = getCurrentFontSize(range, documentFor(range)) + 'px'
  }

  function openDropdown() {
    if (!dropdownEl || !inputEl) return
    const range = cbs.range
    savedBookmark = range ? cbs.capture(range) : null
    if (!savedBookmark || !range) return

    isOpen = true
    dropdownEl.style.display = ''
    updateActiveItem()
    inputEl.value = String(getCurrentFontSize(range, documentFor(range)))
    cancelFocusFrame()

    const view = inputEl.ownerDocument?.defaultView ?? ownerWindow
    if (view?.requestAnimationFrame) {
      focusFrame = view.requestAnimationFrame(() => {
        focusFrame = null
        if (!isOpen || !inputEl?.isConnected) return
        inputEl.focus()
        inputEl.select()
      })
    } else {
      queueMicrotask(() => {
        if (!isOpen || !inputEl?.isConnected) return
        inputEl.focus()
        inputEl.select()
      })
    }
  }

  function closeDropdown() {
    if (!isOpen) return
    const bookmark = savedBookmark
    savedBookmark = null
    isOpen = false
    cancelFocusFrame()
    if (dropdownEl) dropdownEl.style.display = 'none'
    if (bookmark) mutations?.restoreSelection?.(bookmark)
  }

  function updateActiveItem() {
    if (!dropdownEl) return
    const range = cbs.range
    const currentPx = getCurrentFontSize(range, documentFor(range))
    for (const item of dropdownEl.querySelectorAll('[data-size]')) {
      const val = Number(/** @type {HTMLElement} */ (item).dataset.size)
      item.classList.toggle('oe-font-size-item--active', val === currentPx)
    }
  }

  /** Apply a size only to the current valid owner and captured logical range.
   * @param {number} sizePx
   */
  function applySize(sizePx) {
    if (!Number.isInteger(sizePx) || sizePx < FONT_SIZE_MIN || sizePx > FONT_SIZE_MAX) return
    if (sizePx === FONT_SIZE_DEFAULT) {
      removeSize()
      return
    }
    const bookmark = savedBookmark
    if (!bookmark || !cbs.range) { closeDropdown(); return }
    try {
      mutate(range => {
        const result = wrapRangeWithFontSize(range, `${sizePx}px`)
        if (result) {
          const startCe = result.firstSpan.closest('[contenteditable]')
          const endCe = result.lastSpan.closest('[contenteditable]')
          if (startCe) startCe.normalize()
          if (endCe && endCe !== startCe) endCe.normalize()
        }
        if (!cbs.restore(bookmark)) {
          throw new Error('Formatting selection became unavailable after font-size application')
        }
      })
      updateLabel()
    } finally {
      closeDropdown()
    }
  }

  /** Match formatting only when selected authored text is inside the wrapper.
   * A browser range can geometrically intersect a locked widget without granting
   * permission to remove styling from its native/control-owned descendants.
   * @param {HTMLElement} root
   * @param {Range} range
   * @param {string} selector
   * @returns {HTMLElement[]}
   */
  function selectedWrappers(root, range, selector) {
    const text = collectTextTargets(root, range)
    if (!text.length) return []
    return Array.from(root.querySelectorAll(selector))
      .filter(element => text.some(({ node }) => element.contains(node)))
      .map(element => /** @type {HTMLElement} */ (element))
  }

  function removeSize() {
    const bookmark = savedBookmark
    const range = cbs.range
    if (!bookmark || !range) { closeDropdown(); return }
    const root = getWalkRoot(range)
    if (!root) { closeDropdown(); return }
    const relevant = selectedWrappers(root, range, 'span').some(span => !!span.style.fontSize)
    if (!relevant) { closeDropdown(); return }

    try {
      mutate(activeRange => {
        const walkRoot = getWalkRoot(activeRange)
        if (!walkRoot) return
        const doc = documentFor(activeRange)
        if (!doc) return

        // Split only the selected part of each font-size span. Temporary
        // markers retain neighboring class/style attributes until the final
        // normalization, but never become persisted author formatting.
        const toReset = selectedWrappers(walkRoot, activeRange, 'span')
          .filter(span => !!span.style.fontSize)
        for (let index = toReset.length - 1; index >= 0; index--) {
          const span = /** @type {HTMLElement} */ (toReset[index])
          if (!span.isConnected) continue
          const marker = doc.createElement('oe-font-size')
          marker.style.fontSize = span.style.fontSize
          span.style.removeProperty('font-size')
          if (!span.getAttribute('style')) span.removeAttribute('style')
          while (span.firstChild) marker.appendChild(span.firstChild)
          if (span.attributes.length === 0) span.replaceWith(marker)
          else span.appendChild(marker)
        }

        if (!cbs.restore(bookmark)) {
          throw new Error('Formatting selection became unavailable during font-size reset')
        }
        for (let guard = 0; guard < 100; guard++) {
          const current = cbs.range
          if (!current) throw new Error('Font-size reset selection is unavailable')
          const currentRoot = getWalkRoot(current)
          const hasMarker = !!currentRoot
            && selectedWrappers(currentRoot, current, 'oe-font-size').length > 0
          if (!hasMarker) break
          toggleTag('oe-font-size', current)
          if (!cbs.restore(bookmark)) {
            throw new Error('Formatting selection became unavailable during font-size wrapper removal')
          }
        }

        for (const marker of walkRoot.querySelectorAll('oe-font-size')) {
          const span = doc.createElement('span')
          span.style.fontSize = /** @type {HTMLElement} */ (marker).style.fontSize
          while (marker.firstChild) span.appendChild(marker.firstChild)
          marker.replaceWith(span)
        }
        normalizeAfterEdit(getContentEditable(activeRange), walkRoot)
        if (!cbs.restore(bookmark)) {
          throw new Error('Formatting selection became unavailable after font-size reset')
        }
      })
      updateLabel()
    } finally {
      closeDropdown()
    }
  }

  /** @param {HTMLElement} toolbarRoot */
  function buildDropdown(toolbarRoot) {
    const doc = toolbarRoot.ownerDocument
    dropdownEl = el('div', 'oe-font-size-dropdown', undefined, doc)
    dropdownEl.style.display = 'none'

    dropdownEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !isOpen) return
      event.preventDefault()
      event.stopPropagation()
      closeDropdown()
    }, true)

    dropdownEl.addEventListener('mousedown', (e) => {
      if (e.target === inputEl) return
      e.preventDefault()
      e.stopPropagation()
    })

    // Custom input row
    const inputRow = el('div', 'oe-font-size-input-row', undefined, doc)
    inputEl = /** @type {HTMLInputElement} */ (doc.createElement('input'))
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
      }
    })
    // Prevent input/change events from bubbling to wireInputTracking
    // (which would emit editor:changed and trigger undo snapshots).
    inputEl.addEventListener('input', (e) => e.stopPropagation())

    const applyBtn = el('button', 'oe-font-size-apply', { type: 'button' }, doc)
    applyBtn.setAttribute('aria-label', label)
    setTrustedHtml(applyBtn, ICON_CHECK)
    applyBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const val = Number(/** @type {HTMLInputElement} */ (inputEl).value)
      applySize(val)
    })

    const resetBtn = el('button', 'oe-font-size-reset', { type: 'button' }, doc)
    resetBtn.setAttribute('aria-label', `${label}: 16px`)
    setTrustedHtml(resetBtn, createSvgIcon('<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>', 14))
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
    const list = el('ul', 'oe-font-size-list', undefined, doc)
    for (const size of FONT_SIZE_PRESETS) {
      const row = doc.createElement('li')
      const item = el('button', 'oe-font-size-item', { type: 'button', 'data-size': String(size) }, doc)
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
    bindSelectionPort: selection.bind,
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
      return !!findFontSizeSpan(null, ownerDocument)
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
      ownerDocument = button.ownerDocument
      ownerWindow = /** @type {(Window & typeof globalThis) | null} */ (ownerDocument?.defaultView ?? null)
      button.classList.add('oe-font-size-select')
      button.textContent = ''

      sizeLabel = el('span', 'oe-font-size-select__value', undefined, ownerDocument)
      sizeLabel.textContent = FONT_SIZE_DEFAULT + 'px'
      button.appendChild(sizeLabel)

      const chevron = el('span', 'oe-font-size-select__chevron', undefined, ownerDocument)
      setTrustedHtml(chevron, ICON_CHEVRON_SM)
      button.appendChild(chevron)

      selectBtn = button

      const toolbar = /** @type {HTMLElement | null} */ (button.closest('.oe-inline-toolbar'))
      if (toolbar) buildDropdown(toolbar)
      ownerDocument?.addEventListener('mousedown', onDocMouseDown, true)
    },

    destroy() {
      ownerDocument?.removeEventListener('mousedown', onDocMouseDown, true)
      cancelFocusFrame()
      if (dropdownEl) { dropdownEl.remove(); dropdownEl = null }
      savedBookmark = null
      mutations = null
      ownerWindow = null
      ownerDocument = null
    },
  }
}
