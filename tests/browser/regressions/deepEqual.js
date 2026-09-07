/** Test-only structural equality. Never coerce values through JSON: absence,
 * undefined, NaN, signed zero, holes and collections are distinct contracts. */
export function deepEqual(actual, expected, active = new Map()) {
  if (Object.is(actual, expected)) return true
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false
  if (Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) return false
  if (active.has(actual)) return active.get(actual) === expected
  if ([...active.values()].includes(expected)) return false
  active.set(actual, expected)
  try {
    const tag = Object.prototype.toString.call(actual)
    if (tag !== Object.prototype.toString.call(expected)) return false
    if (tag === '[object Date]' && !Object.is(+actual, +expected)) return false
    if (tag === '[object RegExp]' && (actual.source !== expected.source || actual.flags !== expected.flags || actual.lastIndex !== expected.lastIndex)) return false
    if (ArrayBuffer.isView(actual) || tag === '[object ArrayBuffer]') {
      if (actual.byteLength !== expected.byteLength) return false
      const bytes = value => new Uint8Array(value.buffer ?? value, value.byteOffset ?? 0, value.byteLength)
      if (!bytes(actual).every((byte, index) => byte === bytes(expected)[index])) return false
    } else if (tag === '[object Map]' || tag === '[object Set]') {
      if (actual.size !== expected.size) return false
      const remaining = [...expected]
      for (const entry of actual) {
        const index = remaining.findIndex(candidate => deepEqual(entry, candidate, active))
        if (index < 0) return false
        remaining.splice(index, 1)
      }
    } else if (!['[object Object]', '[object Array]', '[object Date]', '[object RegExp]'].includes(tag)) {
      // DOM nodes, promises and weak collections have identity, not an empty
      // set of enumerable keys that makes unrelated instances "equal".
      return false
    }
    if (Array.isArray(actual) && actual.length !== expected.length) return false
    const keys = value => Reflect.ownKeys(value).filter(key => Object.prototype.propertyIsEnumerable.call(value, key))
    const a = keys(actual), b = keys(expected)
    return a.length === b.length && a.every(key => b.includes(key) && deepEqual(actual[key], expected[key], active))
  } finally { active.delete(actual) }
}

export function describe(value) {
  const seen = new WeakSet()
  return JSON.stringify(value, (_key, item) => {
    if (item === undefined) return '[undefined]'
    if (typeof item === 'number' && (!Number.isFinite(item) || Object.is(item, -0))) return `[${Object.is(item, -0) ? '-0' : item}]`
    if (typeof item === 'bigint' || typeof item === 'symbol') return String(item)
    if (item && typeof item === 'object') {
      if (seen.has(item)) return '[Circular]'
      seen.add(item)
      if (item instanceof Map) return { Map: [...item] }
      if (item instanceof Set) return { Set: [...item] }
    }
    return item
  }) ?? String(value)
}
