/** Insert one indentation unit, or indent every line of a multiline selection.
 * A range ending at the next line start leaves that unselected line unchanged.
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
  const contentEnd = value[end - 1] === '\n' ? end - 1 : end
  const indented = spaces + value.slice(lineStart, contentEnd).replace(/\n/g, '\n' + spaces)
  textarea.value = value.slice(0, lineStart) + indented + value.slice(contentEnd)
  textarea.setSelectionRange(lineStart, lineStart + indented.length + end - contentEnd, direction)
}
