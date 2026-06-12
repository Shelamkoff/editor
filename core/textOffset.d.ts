/**
 * Create a TreeWalker that skips text nodes inside inline plugin widgets.
 * @param {Node} root
 * @returns {TreeWalker}
 */
export function editableTextWalker(root: Node): TreeWalker;
/**
 * Get the first text node inside a node.
 * @param {Node} node
 * @returns {Text | null}
 */
export function firstTextNode(node: Node): Text | null;
/**
 * Get the last text node inside a node.
 * @param {Node} node
 * @returns {Text | null}
 */
export function lastTextNode(node: Node): Text | null;
/**
 * Calculate character offset from the start of a container element.
 * Uses TreeWalker over text nodes — consistent with findNodeAtOffset().
 * Handles both text-node and element-node target positions.
 * @param {Node} container
 * @param {Node} targetNode
 * @param {number} targetOffset
 * @returns {number}
 */
export function getTextOffset(container: Node, targetNode: Node, targetOffset: number): number;
/**
 * Restore a text selection by character offsets within an element.
 * Walks text nodes to find the correct start/end positions.
 * @param {HTMLElement} element
 * @param {number} startOffset — character offset from start
 * @param {number} endOffset — character offset for end
 */
export function restoreSelectionByOffsets(element: HTMLElement, startOffset: number, endOffset: number): void;
