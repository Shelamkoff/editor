import { createSimpleInlineTool, ICON_ITALIC } from './utils.js'

/**
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createItalicTool(label, cbs) {
  return createSimpleInlineTool('italic', label, ICON_ITALIC, 'i', 'Mod+I', cbs ?? undefined)
}
