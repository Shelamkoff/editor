/** Block-level tags that represent separate paragraphs */
const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'tr', 'td', 'th', 'figure',
])

/**
 * Create a paragraph that remains owned by inert template content. Cloning
 * untrusted media into a regular detached element can still start loading and
 * fire event attributes before the paste sanitizer gets a chance to run.
 * @returns {HTMLParagraphElement}
 */
function createInertParagraph() {
  const template = document.createElement('template')
  template.innerHTML = '<p></p>'
  return /** @type {HTMLParagraphElement} */ (template.content.firstElementChild)
}

/**
 * @typedef {Object} ExtractedBlock
 * @property {string} tag Lowercase tag name (for example, `p`, `pre`, or `h2`).
 * @property {HTMLElement} element Extracted DOM element.
 */

/**
 * Extract block-level elements from parsed HTML.
 * Returns an array of {tag, element} objects for each block-level element found.
 * Inline-only content is returned as a synthetic 'p' wrapper.
 *
 * @param {ParentNode} container Inert parsed HTML container.
 * @param {(tag: string) => boolean} [isRoutedTag] Tests plugin-owned container tags.
 * @returns {ExtractedBlock[]}
 */
export function extractBlockElements(container, isRoutedTag = () => false) {
  /** @type {ExtractedBlock[]} */
  const results = []
  const isBlockTag = (tag) => BLOCK_TAGS.has(tag) || isRoutedTag(tag)

  const hasBlockChild = Array.from(container.children).some(
    c => isBlockTag(c.tagName.toLowerCase())
  )

  if (!hasBlockChild) {
    // Wrap flat HTML without block structure as a single paragraph.
    const p = createInertParagraph()
    for (const child of container.childNodes) p.appendChild(child.cloneNode(true))
    if (p.innerHTML.trim()) {
      results.push({ tag: 'p', element: p })
    }
    return results
  }

  /**
   * @param {import('../types').DOMNode} node
   */
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent?.trim()
        if (text) {
          const p = createInertParagraph()
          p.textContent = text
          results.push({ tag: 'p', element: p })
        }
        continue
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue

      const el = /** @type {HTMLElement} */ (child)
      const tag = el.tagName.toLowerCase()

      if (tag === 'br') continue

      if (isBlockTag(tag)) {
        results.push({ tag, element: el })
      } else {
        // Inline or unknown — check for nested block children
        const nested = Array.from(el.children).some(
          c => isBlockTag(c.tagName.toLowerCase())
        )

        if (nested) {
          walk(el)
        } else {
          const p = createInertParagraph()
          for (const child of el.childNodes) p.appendChild(child.cloneNode(true))
          if (p.innerHTML.trim()) {
            results.push({ tag: 'p', element: p })
          }
        }
      }
    }
  }

  walk(container)
  return results
}
