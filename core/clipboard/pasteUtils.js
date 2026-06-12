/** Block-level tags that represent separate paragraphs */
const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'tr', 'td', 'th', 'figure',
])

/**
 * @typedef {Object} ExtractedBlock
 * @property {string} tag — lowercase tag name (e.g. 'p', 'pre', 'h2')
 * @property {HTMLElement} element — the DOM element
 */

/**
 * Extract block-level elements from parsed HTML.
 * Returns an array of {tag, element} objects for each block-level element found.
 * Inline-only content is returned as a synthetic 'p' wrapper.
 *
 * @param {HTMLElement} container — parsed HTML container
 * @returns {ExtractedBlock[]}
 */
export function extractBlockElements(container) {
  /** @type {ExtractedBlock[]} */
  const results = []

  const hasBlockChild = Array.from(container.children).some(
    c => BLOCK_TAGS.has(c.tagName.toLowerCase())
  )

  if (!hasBlockChild) {
    // Flat HTML with no block structure — wrap as single paragraph
    const html = container.innerHTML.trim()
    if (html) {
      const p = document.createElement('p')
      p.innerHTML = html
      results.push({ tag: 'p', element: p })
    }
    return results
  }

  /**
   * @param {Node} node
   */
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent?.trim()
        if (text) {
          const p = document.createElement('p')
          p.textContent = text
          results.push({ tag: 'p', element: p })
        }
        continue
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue

      const el = /** @type {HTMLElement} */ (child)
      const tag = el.tagName.toLowerCase()

      if (tag === 'br') continue

      if (BLOCK_TAGS.has(tag)) {
        results.push({ tag, element: el })
      } else {
        // Inline or unknown — check for nested block children
        const nested = Array.from(el.children).some(
          c => BLOCK_TAGS.has(c.tagName.toLowerCase())
        )

        if (nested) {
          walk(el)
        } else {
          const html = el.innerHTML.trim()
          if (html) {
            const p = document.createElement('p')
            p.innerHTML = html
            results.push({ tag: 'p', element: p })
          }
        }
      }
    }
  }

  walk(container)
  return results
}
