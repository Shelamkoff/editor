// @ts-check
import { isRichTextEmpty } from '../../shared/richTextEmpty.js'

/** Join visible rich-text fields without manufacturing a leading/trailing line.
 * @param {string} left
 * @param {string} right
 * @param {{readonly ownerDocument?: Document}} [context]
 * @returns {string}
 */
export function mergeRichText(left, right, context) {
  if (isRichTextEmpty(right, context)) return left
  if (isRichTextEmpty(left, context)) return right
  return left + '<br>' + right
}
