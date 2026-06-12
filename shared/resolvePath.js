/**
 * Resolve a relative file path against a module URL.
 *
 * @param {string} relativePath — path relative to the calling module (e.g. './styles.css')
 * @param {string} base         — pass `import.meta.url` of the calling module
 * @returns {string} absolute URL string
 */
export function resolvePath(relativePath, base) {
  return new URL(relativePath, base).href
}
