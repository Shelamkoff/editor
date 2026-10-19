import { collectTextTargets, getWalkRoot, isolateAncestor } from './utils.js'

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
