import { editSelectedAncestors } from './selectedAncestors.js'
import {
  createSelectionPortBinding,
  getContentEditable,
  getWalkRoot,
  collectTextTargets,
  normalizeAfterEdit,
} from './utils.js'
import { parseRgbCss } from '@shelamkoff/color-picker'
import { createOwnedColorPicker } from '../shared/colorPickerRealm.js'

const ELEMENT_NODE = 1

/**
 * Find the closest <span> with inline background-color on the selection anchor.
 * @param {Range | null} [rangeHint]
 * @param {Document | null} [ownerDocument]
 * @returns {HTMLElement | null}
 */
function findBgSpan(rangeHint = null, ownerDocument = rangeHint?.startContainer?.ownerDocument ?? null) {
  let anchorNode
  if (rangeHint) {
    anchorNode = rangeHint.startContainer
  } else {
    const sel = ownerDocument?.defaultView?.getSelection?.()
    if (!sel || !sel.anchorNode) return null
    anchorNode = sel.anchorNode
  }
  let node = anchorNode.nodeType === ELEMENT_NODE
    ? /** @type {HTMLElement} */ (anchorNode)
    : anchorNode.parentElement
  while (node) {
    if (node.tagName === 'SPAN' && node.style.backgroundColor) return node
    if (node.classList && node.classList.contains('oe-paragraph')) break
    node = node.parentElement
  }
  return null
}

/**
 * Create the background color inline tool with a custom color picker dropdown.
 * @param {string} label
 * @returns {import('./types').InlineTool}
 */
export function createBgColorTool(label) {
  const selection = createSelectionPortBinding()
  const cbs = selection.port
  let lastColor = '#ffffff'

  /** @type {HTMLElement | null} */
  let dotEl = null
  /** @type {HTMLElement | null} */
  let btnEl = null
  /** @type {import('./types').InlineSelectionBookmark | null} */
  let savedBookmark = null
  /** @type {Document | null} */
  let ownerDocument = null
  let pickerOpen = false

  /** @type {ReturnType<typeof createOwnedColorPicker> | null} */
  let picker = null
  /** @type {import('./types').InlineMutationContext | null} */
  let mutations = null

  /** @param {Range | null} [range] @returns {Document | null} */
  function documentFor(range = null) {
    return range?.startContainer?.ownerDocument ?? ownerDocument
  }

  /** Apply only through the active mounted owner, never by mutating an
   * orphaned Range captured before the auxiliary picker gained focus.
   * @param {(range:Range)=>void} operation
   */
  function mutate(operation) {
    if (!mutations || !savedBookmark) return false
    let ran = false
    mutations.mutate(savedBookmark, range => {
      operation(range)
      ran = true
    })
    return ran
  }

  function openPicker() {
    if (!picker) return
    const range = cbs.range
    savedBookmark = range ? cbs.capture(range) : null
    if (!savedBookmark || !range) return

    const existing = findBgSpan(range, documentFor(range))
    let hex = '#ffffff'
    let alpha = 1
    if (existing) {
      const parsed = parseRgbCss(existing.style.backgroundColor)
      hex = parsed.hex
      alpha = parsed.alpha
    }
    pickerOpen = true
    picker.open(hex, alpha)
  }

  function closePicker() {
    pickerOpen = false
    savedBookmark = null
    picker?.close()
  }

  /** @param {string} color */
  function applyColor(color) {
    const bookmark = savedBookmark
    if (!bookmark) { closePicker(); return }
    let applied = false
    try {
      applied = mutate(range => {
        const walkRoot = getWalkRoot(range)
        if (!walkRoot) return
        const targets = collectTextTargets(walkRoot, range)
        for (let i = targets.length - 1; i >= 0; i--) {
          const t = targets[i]
          if (!t) continue
          const { node, startOffset, endOffset } = t
          let targetNode = node
          if (endOffset < node.length) node.splitText(endOffset)
          if (startOffset > 0) targetNode = /** @type {Text} */ (node.splitText(startOffset))
          const parentEl = targetNode.parentElement
          if (parentEl?.tagName === 'SPAN' && parentEl.style.backgroundColor
              && parentEl.childNodes.length === 1 && parentEl.firstChild === targetNode) {
            parentEl.style.backgroundColor = color
          } else {
            const wrapper = targetNode.ownerDocument.createElement('span')
            wrapper.style.backgroundColor = color
            targetNode.parentNode?.insertBefore(wrapper, targetNode)
            wrapper.appendChild(targetNode)
          }
        }
        normalizeAfterEdit(getContentEditable(range), walkRoot)
        if (!cbs.restore(bookmark)) {
          throw new Error('Formatting selection became unavailable after changing background color')
        }
      })
    } finally {
      closePicker()
    }
    if (applied) {
      lastColor = color
      if (dotEl) dotEl.style.backgroundColor = color
    }
  }

  function removeColor() {
    const bookmark = savedBookmark
    if (!bookmark) { closePicker(); return }
    let applied = false
    try {
      applied = mutate(range => {
        const walkRoot = getWalkRoot(range)
        if (!walkRoot) return
        editSelectedAncestors(range,
          span => span.tagName === 'SPAN' && !!span.style.backgroundColor,
          span => {
            span.style.removeProperty('background-color')
            if (span.style.length === 0) span.removeAttribute('style')
            if (span.attributes.length === 0) span.replaceWith(...span.childNodes)
          },
        )
        normalizeAfterEdit(getContentEditable(range), walkRoot)
        if (!cbs.restore(bookmark)) {
          throw new Error('Formatting selection became unavailable after removing background color')
        }
      })
    } finally {
      closePicker()
    }
    if (applied) {
      lastColor = '#ffffff'
      if (dotEl) dotEl.style.backgroundColor = lastColor
    }
  }

  /** @param {KeyboardEvent} event */
  function onPickerKeyDown(event) {
    if (event.key !== 'Escape' || !pickerOpen) return
    event.preventDefault()
    event.stopPropagation()
    const bookmark = savedBookmark
    closePicker()
    if (bookmark) mutations?.restoreSelection?.(bookmark)
  }

  /** @param {MouseEvent} e */
  function onDocMouseDown(e) {
    if (!pickerOpen) return
    const pickerEl = picker?.element
    if (pickerEl && pickerEl.contains(/** @type {Node} */ (e.target))) return
    if (btnEl && btnEl.contains(/** @type {Node} */ (e.target))) return
    closePicker()
  }

  return {
    type: 'bgcolor',
    bindSelectionPort: selection.bind,
    title: label,
    icon: '<span class="oe-inline-tool__color-dot"></span>',
    tag: 'span',

    isDropdownOpen() {
      return pickerOpen
    },

    isActive() {
      if (pickerOpen && picker?.element && !picker.element.offsetParent) {
        pickerOpen = false
        picker.close()
      }
      const range = cbs.range
      const span = findBgSpan(range, documentFor(range))
      if (span && dotEl) {
        dotEl.style.backgroundColor = span.style.backgroundColor
      }
      return !!span
    },

    toggle(_selection) {
      if (pickerOpen) {
        closePicker()
      } else {
        openPicker()
      }
    },

    onMount(button, mutationContext) {
      mutations = mutationContext ?? null
      btnEl = button
      ownerDocument = button.ownerDocument
      dotEl = button.querySelector('.oe-inline-tool__color-dot')
      if (dotEl) dotEl.style.backgroundColor = lastColor

      const toolbar = /** @type {HTMLElement | null} */ (button.closest('.oe-inline-toolbar'))
      if (toolbar) {
        picker = createOwnedColorPicker(ownerDocument ?? button.ownerDocument, {
          onApply: applyColor,
          onRemove: removeColor,
          showRemove: true,
        })
        picker.element.addEventListener('keydown', onPickerKeyDown, true)
        toolbar.appendChild(picker.element)
      }

      ownerDocument.addEventListener('mousedown', onDocMouseDown, true)
    },

    destroy() {
      ownerDocument?.removeEventListener('mousedown', onDocMouseDown, true)
      picker?.element.removeEventListener('keydown', onPickerKeyDown, true)
      picker?.destroy()
      picker = null
      savedBookmark = null
      mutations = null
      ownerDocument = null
    },
  }
}
