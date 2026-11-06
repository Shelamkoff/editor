/** Preserve the original assertion and its cached stack when adding test evidence.
 * @param {Error} error
 * @param {string} diagnostic
 * @returns {Error}
 */
export function appendFailureDiagnostic(error, diagnostic) {
  const originalStack = error.stack ?? String(error)
  const suffix = '\n' + diagnostic
  error.message += suffix
  error.stack = originalStack + suffix
  return error
}
