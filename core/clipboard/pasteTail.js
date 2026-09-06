import { editableAtBoundary } from '../editableFields.js'
import { getTextLength } from '../textOffset.js'

/** @typedef {{ html: string, metadata: import('../types').BlockData }} PasteTail */

/** Extract the unselected suffix of the active field before a block paste.
 * The enclosing clipboard command owns rollback if any later render fails.
 * @param {import('../types').IBlock | undefined} block
 * @returns {PasteTail | null}
 */
export function takePasteTail(block) {
  const selection = window.getSelection()
  if (!block || !selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  const field = editableAtBoundary(block.contentElement, range.startContainer, range.startOffset)?.element
  if (!field || field.contentEditable !== 'true'
      || !field.contains(range.startContainer) || !field.contains(range.endContainer)) {
    throw new RangeError('Block paste requires a selection within one editable field')
  }
  const metadata = block.save()
  const suffix = document.createRange()
  suffix.selectNodeContents(field)
  suffix.setStart(range.endContainer, range.endOffset)
  const template = document.createElement('template')
  template.content.appendChild(suffix.extractContents())
  range.deleteContents()
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  block.markDirty()
  return { html: template.innerHTML, metadata }
}

/** Place the suffix after all inserted content, never into a media caption or
 * a structured plugin's wrapper. Keep the caret at the paste/suffix boundary.
 * @param {import('../types').IBlock | undefined} lastBlock
 * @param {PasteTail | null} tail
 * @param {boolean} mergeText Whether the final inserted item is ordinary text.
 * @param {import('./pasteInsert.js').InsertContext} ctx
 */
export function finishBlockPaste(lastBlock, tail, mergeText, ctx) {
  if (!lastBlock) return
  let focusBlock = lastBlock
  let caretOffset = getTextLength(lastBlock.contentElement)
  if (tail?.html) {
    if (mergeText && lastBlock.contentElement.contentEditable === 'true') {
      const template = document.createElement('template')
      template.innerHTML = lastBlock.importInlineContent(tail.html, tail.metadata.inline)
      lastBlock.contentElement.append(...template.content.childNodes)
      ctx.notifyChanged(lastBlock)
    } else {
      // The last inserted item is a routed block (image, list, table, ...).
      // Its private data shape must not absorb the source paragraph's tail.
      focusBlock = ctx.blocks.insert(
        ctx.defaultBlockType, { text: tail.html }, ctx.blocks.getBlockIndex(lastBlock.id) + 1,
        undefined, tail.metadata.inline, tail.metadata.tunes,
      )
      caretOffset = 0
    }
  }
  ctx.blocks.setCurrentIndex(ctx.blocks.getBlockIndex(focusBlock.id))
  focusBlock.focus()
  ctx.selection.setCaretToOffset(focusBlock.id, caretOffset)
}
