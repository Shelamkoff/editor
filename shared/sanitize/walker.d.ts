/**
 * Recursively sanitize a DOM subtree in place.
 *
 * - Unknown tags are unwrapped (children preserved).
 * - Disallowed attributes are stripped.
 * - `<a>` href is sanitized and `rel="noopener noreferrer"` is forced.
 * - `<span style>` is filtered through the style allowlist.
 * - `<span data-inline-plugin>` subtrees keep all their attributes/styles intact
 *   (inline plugins manage their own markup; style/class whitelisting here would
 *   strip legitimate plugin state like color swatches). Their children are still
 *   recursively sanitized so user-authored content inside plugin widgets is safe.
 *
 * @param {Node} node
 */
export function sanitizeSubtree(node: Node): void;
