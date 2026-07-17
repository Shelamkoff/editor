import { createSimpleInlineTool, ICON_CODE } from './utils.js'

/**
 * Create the built-in inline-code control (`<code>`, `Mod+Shift+M`).
 *
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createCodeTool(label, cbs) {
  return createSimpleInlineTool('code', label, ICON_CODE, 'code', 'Mod+Shift+M', cbs ?? undefined)
}
