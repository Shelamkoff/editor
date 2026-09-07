import { collectTextTargets, getWalkRoot } from './utils.js'

/** Split ordinary inline wrappers around one selected text fragment. Siblings
 * are moved, not serialized, so atomic widgets keep their live DOM ownership.
 * @param {Text} text
 * @param {HTMLElement} ancestor
 */
function isolateAncestor(text, ancestor) {
  /** @type {Node} */
  let part = text
  while (part.parentNode) {
    const parent = /** @type {HTMLElement} */ (part.parentNode)
    const container = parent.parentNode
    if (!container) return
    if (part.previousSibling) {
      const before = parent.cloneNode(false)
      while (parent.firstChild !== part) before.appendChild(parent.firstChild)
      container.insertBefore(before, parent)
    }
    if (part.nextSibling) {
      const after = parent.cloneNode(false)
      while (part.nextSibling) after.appendChild(part.nextSibling)
      container.insertBefore(after, parent.nextSibling)
    }
    if (parent === ancestor) return
    part = parent
  }
}

/** Change matching ancestors only around the selected text, never the rest
 * of a shared wrapper. Callers restore their logical bookmarks after editing.
 * Editing hosts and widget internals are not formatting ancestors.
 * @param {Range} range
 * @param {(element: HTMLElement) => boolean} matches
 * @param {(element: HTMLElement) => void} edit
 * @returns {void}
 */
export function editSelectedAncestors(range, matches, edit) {
  const root = getWalkRoot(range)
  if (!root || range.collapsed) return
  const targets = collectTextTargets(root, range)
  for (const { node, startOffset, endOffset } of targets.reverse()) {
    if (endOffset < node.length) node.splitText(endOffset)
    const selected = startOffset > 0 ? node.splitText(startOffset) : node
    const ancestors = []
    for (let parent = selected.parentElement; parent; parent = parent.parentElement) {
      if (parent.hasAttribute('contenteditable')) break
      if (matches(parent)) ancestors.push(parent)
    }
    for (const ancestor of ancestors) {
      isolateAncestor(selected, ancestor)
      edit(ancestor)
    }
  }
}
