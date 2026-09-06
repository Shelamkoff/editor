/** Resolve both boundaries to live blocks owned by this manager, not merely
 * matching IDs on detached nodes or elements in a different editor.
 * @param {import('./types').IBlockReader} blocks
 * @param {Range} range
 * @returns {{ first: import('./types').IBlock, last: import('./types').IBlock } | null}
 */
export function resolveBlockRange(blocks, range) {
  const first = blocks.getBlockByChildNode(range.startContainer)
  const last = blocks.getBlockByChildNode(range.endContainer)
  if (!first || !last || !first.element.contains(range.startContainer)
      || !last.element.contains(range.endContainer)) return null
  return { first, last }
}
