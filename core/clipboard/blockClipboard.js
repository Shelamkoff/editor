/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Parse the editor's whole-block clipboard payload before the live document is
 * mutated. The payload is lossless: if any entry cannot represent a complete
 * block, reject the whole custom format and let ordinary HTML/text fallbacks
 * handle the paste instead of silently dropping or corrupting entries.
 *
 * Optional metadata is intentionally left untouched here. Consumers already
 * ignore malformed `tunes`, and `Clipboard` applies the same rule to `inline`.
 *
 * @param {string} value
 * @returns {Array<{ type: string, data: Record<string, unknown>, inline?: unknown, tunes?: unknown }> | null}
 */
export function parseBlockClipboardPayload(value) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    for (const block of parsed) {
      if (!isRecord(block)
          || typeof block.type !== 'string'
          || !block.type.trim()
          || !isRecord(block.data)) return null
    }
    return /** @type {Array<{ type: string, data: Record<string, unknown>, inline?: unknown, tunes?: unknown }>} */ (parsed)
  } catch {
    return null
  }
}
