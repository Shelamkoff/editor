import { createSimpleInlineTool, ICON_HIGHLIGHT } from './utils.js'

/**
 * @param {string} label
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createMarkerTool(label, cbs) {
  return createSimpleInlineTool('marker', label, ICON_HIGHLIGHT, 'mark', 'Mod+Shift+H', cbs ?? undefined)
}
