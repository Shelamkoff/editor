import { closestBlock } from '../core/dom.js'
import { editableAtBoundary } from '../core/editableFields.js'
import {
  saveSelectionOffsets,
  restoreSelectionOffsets,
  clearCrossBlockRange,
} from './utils.js'
import { editableTextWalker, getTextOffset } from '../core/textOffset.js'

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

/** @typedef {{ node: Text, start: number, end: number }} CaseTarget */

/** Convert continuous logical text, not each formatting node independently.
 * Field edges, BRs and atomic widgets delimit runs. Node boundaries do not.
 * @param {CaseTarget[]} targets
 * @param {boolean} upper
 * @returns {string[]}
 */
function caseReplacements(targets, upper) {
  const convert = (/** @type {string} */ text) => upper ? text.toUpperCase() : text.toLowerCase()
  /** @type {string[]} */
  const replacements = []
  /** @type {Array<{ index: number, text: string }>} */
  let run = []
  /** @type {Element | null} */
  let previousField = null
  let previousEnd = -1
  const flush = () => {
    const converted = convert(run.map(part => part.text).join(''))
    let offset = 0
    for (const part of run) {
      // Default (not locale-tailored) Unicode contextual casing changes the
      // sigma value, not its width. Unconditional expansions retain their
      // per-fragment widths, letting us distribute the contextual result
      // without discarding existing formatting nodes or selection bookmarks.
      const width = convert(part.text).length
      replacements[part.index] = converted.slice(offset, offset + width)
      offset += width
    }
    run = []
  }
  targets.forEach(({ node, start, end }, index) => {
    const field = node.parentElement?.closest('[contenteditable="true"]') ?? null
    const from = field ? getTextOffset(field, node, start) : 0
    if (!field || field !== previousField || from !== previousEnd) flush()
    run.push({ index, text: node.data.slice(start, end) })
    previousField = field
    previousEnd = field ? getTextOffset(field, node, end) : -1
  })
  flush()
  return replacements
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

      const saved = saveSelectionOffsets(range)
      const endBlock = closestBlock(range.endContainer)
      const endField = saved.singleOffsets?.ce ?? (endBlock
        ? editableAtBoundary(endBlock, range.endContainer, range.endOffset)?.element : null)
      const native = window.getSelection()
      const backward = !native?.isCollapsed && native?.anchorNode === range.endContainer
        && native.anchorOffset === range.endOffset
      let endDelta = 0

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

      // Decide using exactly the editable fragments we will transform. Widget
      // labels participate in Range.toString(), but are not authored text.
      const text = targets.map(({ node, start, end }) => node.data.slice(start, end)).join('')
      if (!text) return
      const toUpper = !isUpperCase(text)

      const replacements = caseReplacements(targets, toUpper)
      // Transform only the clipped portions, preserving each live text node.
      for (const [index, { node, start, end }] of targets.entries()) {
        const before = node.data.slice(0, start)
        const middle = node.data.slice(start, end)
        const after = node.data.slice(end)
        const replacement = replacements[index]
        // Cross-block offsets are local to their fields. An expansion in the
        // first block must not also shift the final block's endpoint.
        if (endField?.contains(node)) endDelta += replacement.length - middle.length
        node.data = before + replacement + after
      }

      if (saved.singleOffsets) saved.singleOffsets.end += endDelta
      else if (saved.crossOffsets) saved.crossOffsets.endOffset += endDelta
      restoreSelectionOffsets(cbs, saved)
      if (backward && saved.singleOffsets && native?.rangeCount) {
        const restored = native.getRangeAt(0)
        native.setBaseAndExtent(restored.endContainer, restored.endOffset, restored.startContainer, restored.startOffset)
      }
      if (!saved.crossOffsets && !saved.singleOffsets) {
        clearCrossBlockRange(cbs)
      }

    },
  }
}
