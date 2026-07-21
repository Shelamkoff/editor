// @ts-check
import { assertJsonValue } from './jsonData.js'

/**
 * Take ownership of serializable editor data at an API boundary.
 * Editor block data is a JSON document model. Validation happens before the
 * clone so history, storage, workers, and network transports observe the same
 * value shape.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function cloneEditorData(value) {
  assertJsonValue(value)
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch (error) {
      const errorName = error && typeof error === 'object' && 'name' in error
        ? error.name
        : undefined
      if (errorName !== 'DataCloneError') throw error
    }
  }
  return JSON.parse(JSON.stringify(value))
}
