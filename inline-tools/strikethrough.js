import { createSimpleInlineTool, ICON_STRIKETHROUGH } from './utils.js'

/**
 * Create the built-in strikethrough control (`<s>`, `Mod+Shift+S`).
 *
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createStrikethroughTool(label, cbs) {
  return createSimpleInlineTool('strikethrough', label, ICON_STRIKETHROUGH, 's', 'Mod+Shift+S', cbs ?? undefined)
}
