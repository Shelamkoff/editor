import { editSelectedAncestors } from './selectedAncestors.js'
import {
  getContentEditable,
  getWalkRoot,
  collectTextTargets,
  normalizeAfterEdit,
  saveSelectionOffsets,
  restoreSelectionOffsets,
} from './utils.js'
import { ColorPicker, parseRgbCss } from '@shelamkoff/color-picker'

/**
 * Find the closest <span> with inline background-color on the selection anchor.
 * @returns {HTMLElement | null}
 */
function findBgSpan() {
  const sel = window.getSelection()
  if (!sel || !sel.anchorNode) return null
  let node = sel.anchorNode.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (sel.anchorNode)
    : sel.anchorNode.parentElement
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
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createBgColorTool(label, cbs = null) {
  let lastColor = '#ffffff'

  /** @type {HTMLElement | null} */
  let dotEl = null
  /** @type {HTMLElement | null} */
  let btnEl = null
  /** @type {Range | null} */
  let savedRange = null
  let pickerOpen = false

  /** @type {ColorPicker | null} */
  let picker = null
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

  function openPicker() {
    if (!picker) return
    savedRange = null
    // Use cross-block range if available (native is clipped).
    // Clone to avoid mutation when addRange clips cross-block ranges.
    const crossRange = cbs?.range
    if (crossRange) {
      savedRange = crossRange.cloneRange()
    } else {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        savedRange = sel.getRangeAt(0).cloneRange()
      }
    }
    if (!savedRange) return

    const existing = findBgSpan()
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
    picker?.close()
  }

  function restoreRange() {
    if (!savedRange) return
    const sel = window.getSelection()
    if (sel) {
      try {
        sel.removeAllRanges()
        sel.addRange(savedRange)
      } catch { /* range may be detached */ }
    }
  }

  /**
   * Prepare selection context for DOM mutation.
   * @returns {{ range: Range, saved: import('./utils.js').SavedOffsets, singleCe: HTMLElement | null, walkRoot: HTMLElement | null } | null}
   */
  function prepareSelectionContext() {
    if (!savedRange) return null
    const range = cbs?.range?.cloneRange() || savedRange
    const saved = saveSelectionOffsets(range)
    restoreRange()

    return {
      range,
      saved,
      singleCe: getContentEditable(range),
      walkRoot: getWalkRoot(range),
    }
  }

  /**
   * Restore selection after DOM mutation using saved offsets.
   * @param {{ saved: import('./utils.js').SavedOffsets, singleCe: HTMLElement | null }} ctx
   */
  function finalizeSelection(ctx) {
    ctx.singleCe?.focus({ preventScroll: true })
    restoreSelectionOffsets(cbs, ctx.saved)
    // Update savedRange from restored selection
    if (!ctx.saved.crossOffsets) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        savedRange = sel.getRangeAt(0).cloneRange()
      }
    }
    closePicker()
  }

  /** @param {string} color */
  function applyColor(color) {
    lastColor = color
    const ctx = prepareSelectionContext()
    if (!ctx) { closePicker(); return }

    mutate(ctx.range, () => {
      if (ctx.walkRoot) {
        const targets = collectTextTargets(ctx.walkRoot, ctx.range)

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
            const wrapper = document.createElement('span')
            wrapper.style.backgroundColor = color
            targetNode.parentNode?.insertBefore(wrapper, targetNode)
            wrapper.appendChild(targetNode)
          }
        }

        normalizeAfterEdit(ctx.singleCe, ctx.walkRoot)
      }
    })

    if (dotEl) dotEl.style.backgroundColor = color
    finalizeSelection(ctx)
  }

  function removeColor() {
    const ctx = prepareSelectionContext()
    if (!ctx) { closePicker(); return }

    mutate(ctx.range, () => {
      if (ctx.walkRoot) {
        editSelectedAncestors(ctx.range,
          span => span.tagName === 'SPAN' && !!span.style.backgroundColor,
          span => {
            span.style.removeProperty('background-color')
            if (span.style.length === 0) span.removeAttribute('style')
            if (span.attributes.length === 0) span.replaceWith(...span.childNodes)
          },
        )
        normalizeAfterEdit(ctx.singleCe, ctx.walkRoot)
      }
    })
    if (dotEl) dotEl.style.backgroundColor = '#ffffff'
    lastColor = '#ffffff'
    finalizeSelection(ctx)
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
      const span = findBgSpan()
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
      dotEl = button.querySelector('.oe-inline-tool__color-dot')
      if (dotEl) dotEl.style.backgroundColor = lastColor

      const toolbar = /** @type {HTMLElement | null} */ (button.closest('.oe-inline-toolbar'))
      if (toolbar) {
        picker = new ColorPicker({
          onApply: applyColor,
          onRemove: removeColor,
          showRemove: true,
        })
        toolbar.appendChild(picker.element)
      }

      document.addEventListener('mousedown', onDocMouseDown, true)
    },

    destroy() {
      document.removeEventListener('mousedown', onDocMouseDown, true)
      picker?.destroy()
      picker = null
      mutations = null
    },
  }
}
