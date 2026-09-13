/** Block-level tags that represent separate paragraphs */
const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'tr', 'td', 'th', 'figure',
])

/**
 * Create a paragraph that remains owned by inert template content. Cloning
 * untrusted media into a regular detached element can still start loading and
 * fire event attributes before the paste sanitizer gets a chance to run.
 * @param {Document} ownerDocument
 * @returns {HTMLParagraphElement}
 */
function createInertParagraph(ownerDocument) {
  const template = ownerDocument.createElement('template')
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
  const ownerDocument = /** @type {Node} */ (container).ownerDocument ?? document
  const isBlockTag = tag => BLOCK_TAGS.has(tag) || isRoutedTag(tag)
  /** @param {ParentNode} node @returns {boolean} */
  const hasBlocks = node => Array.from(node.children).some(
    child => isBlockTag(child.tagName.toLowerCase()) || hasBlocks(child),
  )

  /** @param {ParentNode} node */
  const walk = node => {
    let inline = createInertParagraph(ownerDocument)
    const flush = () => {
      if (inline.innerHTML.trim()) results.push({ tag: 'p', element: inline })
      inline = createInertParagraph(ownerDocument)
    }
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) {
        if (child.nodeType === 3) inline.appendChild(child.cloneNode(true))
        continue
      }
      const element = /** @type {HTMLElement} */ (child)
      const tag = element.tagName.toLowerCase()
      // Plugin-owned structures (tables, lists, quotes...) are indivisible.
      // Generic wrappers may contain multiple logical paragraphs at any depth.
      if (!isRoutedTag(tag) && hasBlocks(element)) {
        flush()
        walk(element)
      } else if (isBlockTag(tag)) {
        flush()
        results.push({ tag, element })
      } else {
        inline.appendChild(element.cloneNode(true))
      }
    }
    flush()
  }
  walk(container)
  return results
}
