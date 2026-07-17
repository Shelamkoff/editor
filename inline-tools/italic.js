import { createSimpleInlineTool, ICON_ITALIC } from './utils.js'

/**
 * Create the built-in italic formatting control (`<i>`, `Mod+I`).
 *
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createItalicTool(label, cbs) {
  return createSimpleInlineTool('italic', label, ICON_ITALIC, 'i', 'Mod+I', cbs ?? undefined)
}
