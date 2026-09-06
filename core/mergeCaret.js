import { editableFields } from './editableFields.js'
import { getTextLength } from './textOffset.js'

/** Capture field-local joins before a plugin appends data. Fixed-field blocks
 * merge corresponding fields; append-only containers (lists/checklists) add
 * fields after their existing items and keep the join in the last old item.
 * Never interpret a pre-merge wrapper offset against a changed field layout.
 * @param {import('./types').IBlock} block
 * @param {'start' | 'end'} edge Which field boundary initiated the merge.
 * @returns {() => { offset: number, fieldIndex?: number }}
 */
export function captureMergeCaret(block, edge) {
  const fields = editableFields(block.contentElement)
  const lengths = fields.map(getTextLength)
  const fallback = getTextLength(block.contentElement)
  return () => {
    if (!fields.length) return { offset: fallback }
    const current = editableFields(block.contentElement)
    const appended = current.length > fields.length
      && fields.every((field, index) => current[index] === field)
    const index = edge === 'end' || appended ? fields.length - 1 : 0
    // Retain the exact field node where possible, with its ordinal as a
    // fallback for plugins that replace their field DOM during merge().
    const liveIndex = current.indexOf(fields[index])
    const fieldIndex = liveIndex >= 0 ? liveIndex : Math.min(index, current.length - 1)
    if (fieldIndex < 0) return { offset: fallback }
    return { fieldIndex, offset: Math.min(lengths[index], getTextLength(current[fieldIndex])) }
  }
}
