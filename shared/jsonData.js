// @ts-check

/**
 * Clone a value while asserting that it can cross the persisted Rector
 * document boundary without changing meaning during JSON serialization.
 *
 * Shared references are duplicated (as JSON does), circular references and
 * non-JSON objects are rejected. Properties are observed exactly once while
 * the owned snapshot is built, so accessor-backed input cannot validate one
 * value and then clone a different one.
 *
 * @template T
 * @param {T} value
 * @param {string} [path]
 * @returns {T}
 */
export function cloneJsonValue(value, path = '$') {
  /** @type {Set<object>} */
  const ancestors = new Set()

  /** @param {unknown} current @param {string} currentPath @returns {unknown} */
  const visit = (current, currentPath) => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new TypeError(`${currentPath} must contain a finite JSON number`)
      return current
    }
    if (typeof current !== 'object') {
      throw new TypeError(`${currentPath} contains a non-JSON ${typeof current} value`)
    }
    if (ancestors.has(current)) throw new TypeError(`${currentPath} contains a circular reference`)

    const prototype = Object.getPrototypeOf(current)
    if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) {
      const name = /** @type {{ constructor?: { name?: string } }} */ (current).constructor?.name || 'object'
      throw new TypeError(`${currentPath} contains non-JSON object ${name}`)
    }

    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        const result = []
        for (let index = 0; index < current.length; index++) {
          if (!(index in current)) throw new TypeError(`${currentPath}[${index}] is an array hole`)
          result.push(visit(current[index], `${currentPath}[${index}]`))
        }
        return result
      }

      /** @type {Record<string, unknown>} */
      const result = {}
      for (const key of Object.keys(current)) {
        // defineProperty keeps JSON's ordinary own-property semantics even for
        // the special "__proto__" key without invoking Object.prototype's setter.
        Object.defineProperty(result, key, {
          value: visit(current[key], `${currentPath}.${key}`),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
      for (const key of Object.getOwnPropertySymbols(current)) {
        if (Object.prototype.propertyIsEnumerable.call(current, key)) {
          throw new TypeError(`${currentPath} contains an enumerable symbol key`)
        }
      }
      return result
    } finally {
      ancestors.delete(current)
    }
  }

  return /** @type {T} */ (visit(value, path))
}

/**
 * Assert that a value can cross the persisted Rector document boundary
 * without changing meaning during JSON serialization.
 *
 * Shared references are allowed (JSON duplicates them), circular references
 * and non-JSON objects are not.
 *
 * @param {unknown} value
 * @param {string} [path]
 */
export function assertJsonValue(value, path = '$') {
  cloneJsonValue(value, path)
}
