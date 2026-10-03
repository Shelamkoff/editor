import { createSimpleInlineTool, ICON_HIGHLIGHT } from './utils.js'

/**
 * Create the built-in text-highlight control (`<mark>`, `Mod+Shift+H`).
 *
 * @param {string} label
 * @returns {import('./types').InlineTool}
 */
export function createMarkerTool(label) {
  return createSimpleInlineTool('marker', label, ICON_HIGHLIGHT, 'mark', 'Mod+Shift+H')
}
