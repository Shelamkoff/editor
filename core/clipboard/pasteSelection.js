import { getTextOffset } from '../textOffset.js'

/** Preserve the insertion target across a failed paste's document rollback.
 * @param {HTMLElement} root
 * @param {import('../types').IBlockManager} blocks
 * @param {import('../types').ISelectionManager} selection
 * @param {import('../types').ICrossBlockSelection} crossSelection
 * @returns {() => void}
 */
export function capturePasteSelection(root, blocks, selection, crossSelection) {
  const native = window.getSelection()
  const cross = crossSelection.range
  const range = cross ?? (native?.rangeCount ? native.getRangeAt(0) : null)
  const selected = new Set(blocks.getSelectedBlocks().map(block => block.id))
  const currentId = blocks.getCurrentBlock()?.id
  const boundary = (node, offset) => {
    const block = blocks.getBlockByChildNode(node)
    return block ? { id: block.id, offset: getTextOffset(block.contentElement, node, offset) } : null
  }
  const start = range ? boundary(range.startContainer, range.startOffset) : null
  const end = range ? boundary(range.endContainer, range.endOffset) : null
  return () => {
    for (const block of blocks) block.selected = selected.has(block.id)
    if (currentId) blocks.setCurrentIndex(blocks.getBlockIndex(currentId))
    if (!start || !end || !native) return
    selection.setCaretToOffset(start.id, start.offset)
    if (!native.rangeCount) return
    const restored = native.getRangeAt(0).cloneRange()
    selection.setCaretToOffset(end.id, end.offset)
    if (!native.rangeCount) return
    const last = native.getRangeAt(0)
    restored.setEnd(last.startContainer, last.startOffset)
    native.removeAllRanges()
    native.addRange(restored)
    if (cross) crossSelection.activate(restored, root)
  }
}
