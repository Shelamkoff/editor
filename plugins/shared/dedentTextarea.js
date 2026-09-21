/**
 * Remove one space indentation unit from every line touched by a textarea
 * selection. A caret inside the indentation still targets the whole line;
 * a nonempty selection ending at the next line start excludes that line.
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {number} width Positive indentation width owned by the caller.
 * @returns {boolean} Whether the document text changed.
 */
export function dedentTextarea(textarea, width) {
  const value = textarea.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const direction = textarea.selectionDirection
  const firstLine = value.slice(0, start).lastIndexOf('\n') + 1
  const nextLine = value.indexOf('\n', end)
  const limit = end > start && value[end - 1] === '\n'
    ? end : nextLine === -1 ? value.length : nextLine
  let removedBeforeStart = 0
  let removedBeforeEnd = 0
  const selected = value.slice(firstLine, limit)
  const dedented = selected.replace(/^ +/gm, (spaces, offset) => {
    const count = Math.min(width, spaces.length)
    const position = firstLine + offset
    removedBeforeStart += Math.min(count, Math.max(0, start - position))
    removedBeforeEnd += Math.min(count, Math.max(0, end - position))
    return spaces.slice(count)
  })
  if (dedented === selected) return false
  textarea.value = value.slice(0, firstLine) + dedented + value.slice(limit)
  textarea.setSelectionRange(start - removedBeforeStart, end - removedBeforeEnd, direction)
  return true
}
