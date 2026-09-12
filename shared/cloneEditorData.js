// @ts-check
import { cloneJsonValue } from './jsonData.js'

/**
 * Take ownership of serializable editor data at an API boundary.
 * Editor block data is a JSON document model. Validation and cloning happen
 * in one traversal so history, storage, workers, and network transports
 * observe one stable snapshot even when consumer input uses accessors.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function cloneEditorData(value) {
  return cloneJsonValue(value)
}
