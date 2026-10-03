import { createSimpleInlineTool, ICON_ITALIC } from './utils.js'

/**
 * Create the built-in italic formatting control (`<i>`, `Mod+I`).
 *
 * @param {string} label
 * @returns {import('./types').InlineTool}
 */
export function createItalicTool(label) {
  return createSimpleInlineTool('italic', label, ICON_ITALIC, 'i', 'Mod+I')
}
