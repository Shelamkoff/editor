// @ts-check

/**
 * Fit owned rich-text columns to a supported layout without discarding content.
 * The caller supplies the validated layout size. Surplus non-blank columns
 * follow the same merge policy during import and interactive layout changes.
 * @param {Array<{ content: string }>} columns
 * @param {number} size
 * @returns {Array<{ content: string }>}
 */
export function fitColumnsToLayout(columns, size) {
  const result = Array.from({ length: size }, (_, index) => ({ content: columns[index]?.content ?? '' }))
  const last = result[size - 1]
  for (const column of columns.slice(size)) {
    if (!column.content.trim()) continue
    last.content = last.content ? last.content + '<br>' + column.content : column.content
  }
  return result
}
