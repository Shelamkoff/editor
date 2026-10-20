// @ts-check

const objectConstructorSource = Function.prototype.toString.call(Object)

/** Accept the intrinsic Object prototype from any realm, not arbitrary classes.
 * Inspect descriptors instead of invoking caller-owned constructor getters.
 * @param {object | null} prototype
 */
export function isPlainObjectPrototype(prototype) {
  if (prototype === null || prototype === Object.prototype) return true
  if (Object.getPrototypeOf(prototype) !== null) return false
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
  return typeof constructor === 'function'
    && Object.getOwnPropertyDescriptor(constructor, 'prototype')?.value === prototype
    && Function.prototype.toString.call(constructor) === objectConstructorSource
}

/** Compare already-owned JSON values without treating object key insertion
 * order as a document edit. Array order, types and actual key presence matter.
 * Inputs at these call sites were captured at the JSON validation boundary.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function equalJsonValue(left, right) {
  if (left === right) return true
  if (left === null || right === null
    || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) return false
    for (let index = 0; index < left.length; index++) {
      if (Object.hasOwn(left, index) !== Object.hasOwn(right, index)
        || !equalJsonValue(left[index], right[index])) return false
    }
    return true
  }
  if (Array.isArray(right)) return false
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  for (const key of keys) {
    if (!Object.hasOwn(right, key)
      || !equalJsonValue(left[key], right[key])) return false
  }
  return true
}

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
    if (!Array.isArray(current) && !isPlainObjectPrototype(prototype)) {
      const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
      const name = typeof constructor === 'function' && constructor.name ? constructor.name : 'object'
      throw new TypeError(`${currentPath} contains non-JSON object ${name}`)
    }

    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        const result = []
        for (let index = 0; index < current.length; index++) {
          if (!Object.hasOwn(current, index)) throw new TypeError(`${currentPath}[${index}] is an array hole`)
          result.push(visit(current[index], `${currentPath}[${index}]`))
        }
        return result
      }

      // The persisted JSON boundary forbids enumerable symbol keys on
      // records. Reject their *names* before reading any ordinary payload
      // accessor; a rejected shape must not execute author-owned data code.
      for (const key of Object.getOwnPropertySymbols(current)) {
        if (Object.prototype.propertyIsEnumerable.call(current, key)) {
          throw new TypeError(`${currentPath} contains an enumerable symbol key`)
        }
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
