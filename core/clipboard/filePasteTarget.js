/** Capture only the document state a pending file paste may replace.
 * A Range is live, so retain its endpoint values separately. Unrelated edits
 * must not cancel an upload, but an obsolete replacement must never delete
 * newer content (including blocks newly inserted between range endpoints).
 * @param {import('../types').IBlockReader} blocks
 * @param {import('../types').ICrossBlockSelection} crossSelection
 * @param {{ crossRange: Range | null, selectedIds: string[], anchorBlockId?: string }} target
 * @param {boolean} mayReplaceEmpty Whether one file may replace an empty anchor.
 * @returns {() => boolean}
 */
export function captureFilePasteTarget(blocks, crossSelection, target, mayReplaceEmpty) {
  const anchor = target.anchorBlockId ? blocks.getBlockById(target.anchorBlockId) : undefined
  const anchorVersion = anchor?.version
  const replacesEmpty = mayReplaceEmpty && anchor?.isEmpty()
  const range = target.crossRange
  const start = range ? { node: range.startContainer, offset: range.startOffset } : null
  const end = range ? { node: range.endContainer, offset: range.endOffset } : null
  const selected = new Set(target.selectedIds)
  const first = start ? blocks.getBlockByChildNode(start.node) : undefined
  const last = end ? blocks.getBlockByChildNode(end.node) : undefined
  const firstIndex = first ? blocks.getBlockIndex(first.id) : -1
  const lastIndex = last ? blocks.getBlockIndex(last.id) : -1
  const captured = [...blocks].filter((block, index) => range
    ? index >= firstIndex && index <= lastIndex
    : selected.has(block.id))
    .map(block => ({ block, version: block.version }))

  return () => {
    if (anchor && blocks.getBlockById(anchor.id) !== anchor) return false
    if (replacesEmpty && anchor.version !== anchorVersion) return false
    if (captured.some(({ block, version }) => blocks.getBlockById(block.id) !== block || block.version !== version)) return false

    if (range) {
      const current = crossSelection.range
      if (!first || !last || firstIndex < 0 || lastIndex < firstIndex || !current) return false
      if (current.startContainer !== start.node || current.startOffset !== start.offset
          || current.endContainer !== end.node || current.endOffset !== end.offset) return false
      const from = blocks.getBlockIndex(first.id)
      const to = blocks.getBlockIndex(last.id)
      return to - from + 1 === captured.length
        && captured.every(({ block }, index) => blocks.getBlockByIndex(from + index) === block)
    }
    if (selected.size) {
      const current = blocks.getSelectedBlocks()
      return captured.length === selected.size && current.length === captured.length
        && current.every((block, index) => block === captured[index].block)
    }
    return true
  }
}
