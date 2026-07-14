// @ts-check

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
  /** @type {Set<object>} */
  const ancestors = new Set()

  /** @param {unknown} current @param {string} currentPath */
  const visit = (current, currentPath) => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new TypeError(`${currentPath} must contain a finite JSON number`)
      return
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
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index++) {
        if (!(index in current)) throw new TypeError(`${currentPath}[${index}] is an array hole`)
        visit(current[index], `${currentPath}[${index}]`)
      }
    } else {
      for (const key of Object.keys(current)) visit(current[key], `${currentPath}.${key}`)
      for (const key of Object.getOwnPropertySymbols(current)) {
        if (Object.prototype.propertyIsEnumerable.call(current, key)) {
          throw new TypeError(`${currentPath} contains an enumerable symbol key`)
        }
      }
    }
    ancestors.delete(current)
  }

  visit(value, path)
}
