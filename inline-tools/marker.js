import { createSimpleInlineTool, ICON_HIGHLIGHT } from './utils.js'

/**
 * Create the built-in text-highlight control (`<mark>`, `Mod+Shift+H`).
 *
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createMarkerTool(label, cbs) {
  return createSimpleInlineTool('marker', label, ICON_HIGHLIGHT, 'mark', 'Mod+Shift+H', cbs ?? undefined)
}
