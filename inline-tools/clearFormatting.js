import {
  ICON_CLEAR,
  restoreSelectionOffsets,
  saveSelectionOffsets,
  toggleTag,
} from './utils.js'

const CLEARABLE_TAGS = ['b', 'i', 's', 'code', 'mark', 'span', 'em', 'strong', 'u', 'sup', 'sub']

/**
 * Keep inline-plugin widgets intact while clearing ordinary text wrappers.
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isClearableElement(element) {
  return !element.dataset.inlinePlugin && !element.closest('[data-inline-plugin]')
}

/**
 * Return whether a matching wrapper affects any part of the range.
 * @param {Range} range
 * @param {string} tag
 * @returns {boolean}
 */
function hasClearableWrapper(range, tag) {
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (range.startContainer)
    : range.startContainer.parentElement
  let ancestor = start
  while (ancestor && ancestor.getAttribute('contenteditable') !== 'true') {
    if (ancestor.matches(tag) && isClearableElement(ancestor)) return true
    ancestor = ancestor.parentElement
  }

  const common = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (range.commonAncestorContainer)
    : range.commonAncestorContainer.parentElement
  const root = common?.closest('[contenteditable="true"]') || common
  return !!root && Array.from(root.querySelectorAll(tag)).some(element => (
    isClearableElement(/** @type {HTMLElement} */ (element))
      && range.intersectsNode(element)
  ))
}

/**
 * Create an inline tool that removes ordinary text formatting from exactly
 * the selected characters. Links and inline-plugin widgets are preserved.
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createClearFormattingTool(label, cbs = null) {
  return {
    type: 'clearFormatting',
    title: label,
    icon: ICON_CLEAR,
    isActive: () => false,
    toggle(selection) {
      const actualRange = cbs?.range || selection?.range
      if (!actualRange || actualRange.collapsed) return
      const saved = saveSelectionOffsets(actualRange)

      for (const tag of CLEARABLE_TAGS) {
        restoreSelectionOffsets(cbs, saved)
        const selection = window.getSelection()
        const current = cbs?.range || (selection?.rangeCount ? selection.getRangeAt(0) : null)
        if (!current || !hasClearableWrapper(current, tag)) continue
        toggleTag(tag, current, isClearableElement)
      }

      restoreSelectionOffsets(cbs, saved)
    },
  }
}
