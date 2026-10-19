import {
  createSelectionPortBinding,
  ICON_CLEAR,
  toggleTag,
  getWalkRoot,
  collectTextTargets,
} from './utils.js'

const CLEARABLE_TAGS = ['b', 'i', 's', 'code', 'mark', 'span', 'em', 'strong', 'u', 'sup', 'sub']

/** Keep inline-plugin widgets intact while clearing ordinary text wrappers.
 * @param {HTMLElement} element
 */
function isClearableElement(element) {
  return !element.dataset.inlinePlugin && !element.closest('[data-inline-plugin]')
}

/** A format wrapper matters only when selected, authored text is inside it.
 * Intersecting an unrelated bold label or a locked native control must not
 * cause Clear Formatting to author a new wrapper on plain text.
 * @param {Range} range
 * @param {string} tag
 */
function hasClearableWrapper(range, tag) {
  const root = getWalkRoot(range)
  if (!root) return false
  return collectTextTargets(root, range).some(({ node }) => {
    for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.hasAttribute('contenteditable')) break
      if (ancestor.matches(tag) && isClearableElement(ancestor)) return true
    }
    return false
  })
}

/**
 * Create an inline tool that removes ordinary text formatting from exactly
 * the selected characters. Links and inline-plugin widgets are preserved.
 * @param {string} label
 * @returns {import('./types').InlineTool}
 */
export function createClearFormattingTool(label) {
  const selectionPort = createSelectionPortBinding()
  const cbs = selectionPort.port
  return {
    type: 'clearFormatting',
    bindSelectionPort: selectionPort.bind,
    title: label,
    icon: ICON_CLEAR,
    isActive: () => false,
    toggle(selection) {
      const actualRange = cbs?.range || selection?.range
      if (!actualRange || actualRange.collapsed) return
      const bookmark = cbs.capture(actualRange)
      if (!bookmark) return

      for (const tag of CLEARABLE_TAGS) {
        if (!cbs.restore(bookmark)) {
          throw new Error('Formatting selection became unavailable while clearing wrappers')
        }
        const current = cbs.range
        if (!current || !hasClearableWrapper(current, tag)) continue
        toggleTag(tag, current, isClearableElement)
      }

      if (!cbs.restore(bookmark)) {
        throw new Error('Formatting selection became unavailable after clearing wrappers')
      }
    },
  }
}
