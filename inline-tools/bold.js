import { createSimpleInlineTool, ICON_BOLD } from './utils.js'

/**
 * Create the built-in bold formatting control (`<b>`, `Mod+B`).
 *
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createBoldTool(label, cbs) {
  return createSimpleInlineTool('bold', label, ICON_BOLD, 'b', 'Mod+B', cbs ?? undefined)
}
