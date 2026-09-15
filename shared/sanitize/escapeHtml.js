/**
 * Escape a string for safe insertion into HTML text content.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (!text) return ''
  return String(text).replace(/[&<>]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  })[character] ?? character)
}
