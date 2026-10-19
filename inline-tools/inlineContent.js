/** Inline tag selector for empty-tag cleanup. */
const INLINE_TAGS_SELECTOR = 'b, i, s, em, strong, u, mark, code, span, a, sup, sub'
const ELEMENT_NODE = 1
const DOCUMENT_FRAGMENT_NODE = 11

const TEXT_NODE = 3
// A formatting operation owns author text, never DOM maintained by native
// controls, nested editing hosts or mounted inline extensions.
const PROTECTED_OWNER_SELECTOR = '[data-inline-plugin], [contenteditable="false"], button, input, textarea, select, option, [role="button"]'
const NORMALIZE_BOUNDARY_SELECTOR = '[data-inline-plugin], [contenteditable], button, input, textarea, select, option, [role="button"]'

// Native controls and inline widget owners cannot be authored text hosts. A
// plugin wrapper with contenteditable=false may still contain legitimate
// contenteditable=true fields, which are selected by their own nearest host.
const NATIVE_OWNER_SELECTOR = '[data-inline-plugin], button, input, textarea, select, option, [role="button"]'

/** Resolve the nearest *actual* editing host of an author formatting node.
 * @param {Element} element
 * @returns {Element | null}
 */
function authorHost(element) {
  if (element.closest(NATIVE_OWNER_SELECTOR)) return null
  const host = element.closest('[contenteditable]')
  return host?.getAttribute('contenteditable') === 'true' ? host : null
}


/** @param {Node} node @returns {boolean} */
export function hasProtectedDomContent(node) {
  if (node.nodeType !== ELEMENT_NODE && node.nodeType !== DOCUMENT_FRAGMENT_NODE) return false
  const element = /** @type {Element | DocumentFragment} */ (node)
  return (node.nodeType === ELEMENT_NODE && /** @type {Element} */ (node).matches(NORMALIZE_BOUNDARY_SELECTOR))
    || !!element.querySelector(NORMALIZE_BOUNDARY_SELECTOR)
}

/** Normalize only authored text leaves, without walking into independently
 * owned controls or modifying their text-node identities. Node.normalize() on
 * a whole editing host is recursive, so invoking it directly also normalizes
 * locked input/widget descendants.
 * @param {Node | null} root
 */
export function normalizeAuthoredText(root) {
  if (!root || root.nodeType !== ELEMENT_NODE) return
  const element = /** @type {Element} */ (root)
  if (element.closest(NATIVE_OWNER_SELECTOR)) return

  const nearest = element.closest('[contenteditable]')
  if (!nearest) {
    // A cross-block selection can use an editor shell as its walk root.
    // Do not normalize its toolbar, block chrome or other static UI. Visit
    // only actual author fields, traversing contenteditable=false plugin
    // containers without normalizing their own text.
    /** @param {Element} parent */
    const visitHosts = parent => {
      for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType !== ELEMENT_NODE) continue
        const child = /** @type {Element} */ (node)
        if (child.matches(NATIVE_OWNER_SELECTOR)) continue
        if (child.getAttribute('contenteditable') === 'true') {
          normalizeAuthoredText(child)
        } else {
          visitHosts(child)
        }
      }
    }
    visitHosts(element)
    return
  }
  if (!authorHost(element)) return

  /** @param {Element} parent */
  const visit = parent => {
    /** @type {Node | null} */
    let node = parent.firstChild
    while (node) {
      if (node.nodeType === TEXT_NODE) {
        if (!node.textContent?.length) {
          const next = node.nextSibling
          node.parentNode?.removeChild(node)
          node = next
          continue
        }
        while (node.nextSibling?.nodeType === TEXT_NODE) {
          const sibling = /** @type {Text} */ (node.nextSibling)
          const current = /** @type {Text} */ (node)
          current.appendData(sibling.data)
          sibling.parentNode?.removeChild(sibling)
        }
      } else if (node.nodeType === ELEMENT_NODE
        && !/** @type {Element} */ (node).matches(NORMALIZE_BOUNDARY_SELECTOR)) {
        visit(/** @type {Element} */ (node))
      }
      node = node.nextSibling
    }
  }

  visit(element)
}

/** Author-created line breaks and images are content even without text.
 * @param {Node} node
 * @returns {boolean}
 */
export function hasInlineContent(node) {
  return !!node.textContent || (
    (node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_FRAGMENT_NODE)
    && (!!/** @type {Element | DocumentFragment} */ (node).querySelector('br, img')
      || hasProtectedDomContent(node))
  )
}

/**
 * Remove empty inline wrapper tags and normalize text nodes.
 * Called after any DOM mutation that unwraps/removes inline formatting.
 * @param {Node | null} parent
 * @returns {void}
 */
export function removeEmptyInlineTags(parent) {
  if (!parent || parent.nodeType !== ELEMENT_NODE) return
  const empties = /** @type {HTMLElement} */ (parent).querySelectorAll(INLINE_TAGS_SELECTOR)
  for (const el of empties) {
    // Embedded native, locked and inline-widget descendants are independently
    // owned controls, including empty nodes with no visible text. Do not treat
    // their elements as disposable editor formatting wrappers.
    if (el.hasAttribute('contenteditable') || !authorHost(el)) continue
    if (!hasInlineContent(el)) el.remove()
  }
  normalizeAuthoredText(parent)
}

