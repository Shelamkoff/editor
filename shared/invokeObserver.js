/**
 * Invoke one consumer observer without allowing sync throws or rejected
 * promises to escape into the editor's control flow.
 *
 * Observer return values are intentionally ignored. A returned thenable is
 * observed only so its rejection can be contained.
 *
 * @param {Function | undefined} callback
 * @param {unknown[]} [args]
 * @param {(error: unknown) => void} [onError]
 * @returns {void}
 */
export function invokeObserver(callback, args = [], onError = () => {}) {
  if (typeof callback !== 'function') return

  const report = error => {
    try { onError(error) } catch { /* observers cannot break containment */ }
  }

  try {
    const result = callback(...args)
    if (result && (typeof result === 'object' || typeof result === 'function')) {
      // Let Promise resolution inspect `then` once. Preflighting it here
      // would observe an accessor twice and could adopt a different method.
      Promise.resolve(result).catch(report)
    }
  } catch (error) {
    report(error)
  }
}
