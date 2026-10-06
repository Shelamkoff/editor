// @ts-check

/** Keep the two stable identities distinct without restricting author IDs.
 * @param {string} rowId
 * @param {string} cellId
 */
export function tableFieldKey(rowId, cellId) {
  const escape = value => value.replaceAll('%', '%25').replaceAll(':', '%3A')
  return `cell:${escape(rowId)}:${escape(cellId)}`
}
