/**
 * Populate a block manager from saved data.
 * Shared between initial load (`createEditor`) and undo/redo restore (`EditorFacade.render`).
 *
 * @param {import('./types').IBlockManager} blocks
 * @param {import('./types').BlockData[] | undefined} blockList
 * @param {string} defaultBlockType
 * @param {string} [logPrefix] - label for console messages
 */
export function populateBlocks(blocks: import("./types").IBlockManager, blockList: import("./types").BlockData[] | undefined, defaultBlockType: string, logPrefix?: string): void;
