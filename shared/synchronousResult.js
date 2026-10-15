// @ts-check

/** Reject asynchronous completion without inspecting a caller-owned `then` twice.
 * @template T
 * @param {T} value
 * @param {(error: unknown) => void} [onError]
 * @returns {T}
 */
export function synchronousResult(value, onError = () => {}) {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    const then = /** @type {any} */ (value).then
    if (typeof then === 'function') {
      Promise.resolve({ then: (resolve, reject) => Reflect.apply(then, value, [resolve, reject]) })
        .catch(error => { try { onError(error) } catch {} })
      throw new TypeError('Extension operation must complete synchronously')
    }
  }
  return value
}
