/** Inline tag selector for empty-tag cleanup. */
const INLINE_TAGS_SELECTOR = 'b, i, s, em, strong, u, mark, code, span, a, sup, sub'
const ELEMENT_NODE = 1
const DOCUMENT_FRAGMENT_NODE = 11

// Editing hosts and controls form boundaries between independently owned DOM.
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

/** Discover the editing hosts owned by a formatting walk. A false plugin
 * shell may contain real fields; a true host owns only its own text and
 * never transfers formatting rights to a nested editing host or control.
 * @param {Element} root
 * @returns {HTMLElement[]}
 */
export function authoredEditingHosts(root) {
  if (root.closest(NATIVE_OWNER_SELECTOR)) return []
  const nearest = root.closest('[contenteditable]')
  if (nearest?.getAttribute('contenteditable') === 'true') {
    return [/** @type {HTMLElement} */ (nearest)]
  }
  /** @type {HTMLElement[]} */
  const hosts = []
  /** @param {Element} parent */
  const visit = parent => {
    for (const node of parent.childNodes) {
      if (node.nodeType !== ELEMENT_NODE) continue
      const child = /** @type {Element} */ (node)
      if (child.matches(NATIVE_OWNER_SELECTOR)) continue
      if (child.getAttribute('contenteditable') === 'true') {
        hosts.push(/** @type {HTMLElement} */ (child))
      } else visit(child)
    }
  }
  visit(root)
  return hosts
}

/** Identify independently owned controls and editing hosts inside a subtree.
 * @param {Node} node
 * @returns {boolean}
 */
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
 * @returns {void}
 */
export function normalizeAuthoredText(root) {
  if (!root || root.nodeType !== ELEMENT_NODE) return
  const element = /** @type {Element} */ (root)
  if (element.closest(NATIVE_OWNER_SELECTOR)) return

  const nearest = element.closest('[contenteditable]')
  if (!nearest || nearest.getAttribute('contenteditable') !== 'true') {
    // The walk root may be an editor shell or a contenteditable=false block
    // shell containing legitimate nested author fields. Never edit text in
    // that shell itself; discover only explicit true editing hosts beneath it.
    for (const host of authoredEditingHosts(element)) normalizeAuthoredText(host)
    return
  }
  if (!authorHost(element)) return

  /** @param {Element} parent */
  const visit = parent => {
    // Native Node.normalize() correctly relocates *all* live DOM Range
    // endpoints when it joins Text leaves. appendData()+removeChild() does
    // not: a selected removed leaf becomes a parent/child-index boundary.
    // Only invoke it where it cannot recurse into an independently owned
    // control or a different contenteditable host.
    if (!parent.querySelector(NORMALIZE_BOUNDARY_SELECTOR)) {
      parent.normalize()
      return
    }
    // At mixed-owner levels leave direct Text siblings intact. There is no
    // way to enumerate every live DOM Range before deleting one manually.
    // Descend into safe authored subtrees and let their native normalize()
    // preserve browser caret and history range semantics.
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType !== ELEMENT_NODE) continue
      const child = /** @type {Element} */ (node)
      if (!child.matches(NORMALIZE_BOUNDARY_SELECTOR)) visit(child)
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

