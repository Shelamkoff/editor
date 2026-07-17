import {
  saveSelectionOffsets,
  restoreSelectionOffsets,
  clearCrossBlockRange,
} from './utils.js'
import { editableTextWalker } from '../core/textOffset.js'

// Tabler: letter-case-toggle
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 15.5v-7a2.5 2.5 0 0 1 5 0v7"/><path d="M6.5 12h5"/><path d="M15 15.5v-3.5a2 2 0 1 1 4 0v3.5"/></svg>'

/**
 * @param {string} text
 * @returns {boolean}
 */
function isUpperCase(text) {
  // Comparing both case mappings recognizes cased letters independently of
  // their script without treating digits and punctuation as letters.
  const letters = Array.from(text)
    .filter(char => char.toLocaleLowerCase() !== char.toLocaleUpperCase())
    .join('')
  return letters.length > 0 && letters === letters.toUpperCase()
}

/**
 * Create inline tool that toggles selected text between UPPERCASE and lowercase.
 *
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createCaseTransformTool(label, cbs = null) {
  return {
    type: 'caseTransform',
    title: label,
    icon: ICON,

    isActive: () => false,

    toggle(selection) {
      const range = selection?.range
      if (!range || range.collapsed) return

      const text = range.toString()
      if (!text) return

      const toUpper = !isUpperCase(text)

      const saved = saveSelectionOffsets(range)

      // Collect only text nodes clipped to range boundaries
      const ancestor = range.commonAncestorContainer
      const walkParent = ancestor.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (ancestor)
        : ancestor.parentElement
      if (!walkParent) return

      const walker = editableTextWalker(walkParent)
      /** @type {{ node: Text, start: number, end: number }[]} */
      const targets = []

      while (walker.nextNode()) {
        const node = /** @type {Text} */ (walker.currentNode)
        if (!range.intersectsNode(node)) continue
        let start = 0
        let end = node.length
        if (node === range.startContainer) start = range.startOffset
        if (node === range.endContainer) end = range.endOffset
        if (start >= end) continue
        targets.push({ node, start, end })
      }

      // Transform only the clipped portions
      for (const { node, start, end } of targets) {
        const before = node.data.slice(0, start)
        const middle = node.data.slice(start, end)
        const after = node.data.slice(end)
        node.data = before + (toUpper ? middle.toUpperCase() : middle.toLowerCase()) + after
      }

      restoreSelectionOffsets(cbs, saved)
      if (!saved.crossOffsets && !saved.singleOffsets) {
        clearCrossBlockRange(cbs)
      }

    },
  }
}
