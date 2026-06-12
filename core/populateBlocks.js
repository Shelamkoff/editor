/**
 * Populate a block manager from saved data.
 * Shared between initial load (`createEditor`) and undo/redo restore (`EditorFacade.render`).
 *
 * @param {import('./types').IBlockManager} blocks
 * @param {import('./types').BlockData[] | undefined} blockList
 * @param {string} defaultBlockType
 * @param {string} [logPrefix] - label for console messages
 */
export function populateBlocks(blocks, blockList, defaultBlockType, logPrefix = 'Editor') {
  if (blockList?.length) {
    for (const blockData of blockList) {
      try {
        blocks.insert(
          blockData.type,
          blockData.data,
          blocks.getBlockCount(),
          blockData.id,
          blockData.inline,
        )
      } catch (err) {
        console.warn(`[${logPrefix}] Unknown block type "${blockData.type}", falling back to "${defaultBlockType}":`, err)
        try {
          blocks.insert(defaultBlockType, blockData.data, blocks.getBlockCount(), undefined, blockData.inline)
        } catch (fallbackErr) {
          console.error(`[${logPrefix}] Failed to insert default block type "${defaultBlockType}":`, fallbackErr)
        }
      }
    }
  } else {
    blocks.insert(defaultBlockType)
  }
}
