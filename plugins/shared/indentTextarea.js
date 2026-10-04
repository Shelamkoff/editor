/** Insert one indentation unit, or indent every line of a multiline selection.
 * @param {HTMLTextAreaElement} textarea
 * @param {number} width
 * @returns {void} Updates the value and selection in place.
 */
export function indentTextarea(textarea, width) {
  const value = textarea.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const spaces = ' '.repeat(width)
  if (start === end || !value.slice(start, end).includes('\n')) {
    textarea.setRangeText(spaces, start, end, 'end')
    return
  }
  const direction = textarea.selectionDirection
  const lineStart = value.slice(0, start).lastIndexOf('\n') + 1
  const indented = spaces + value.slice(lineStart, end).replace(/\n/g, '\n' + spaces)
  textarea.value = value.slice(0, lineStart) + indented + value.slice(end)
  textarea.setSelectionRange(lineStart, lineStart + indented.length, direction)
}
