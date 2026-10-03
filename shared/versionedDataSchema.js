// @ts-check
import { cloneEditorData } from './cloneEditorData.js'

/**
 * @template {Record<string, unknown>} D
 * @typedef {{
 *   currentVersion: number,
 *   createDefault: () => D,
 *   normalize: (input: any) => D,
 *   mapRichText?: (data: D, transform: (html: string, fieldKey: string) => string) => void,
 * }} VersionedDataSchemaOptions
 */

/** @param {unknown} value @param {string} label */
function assertVersion(value, label) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new RangeError(`${label} must be a positive safe integer`)
  }
  return Number(value)
}

/**
 * Own one JSON object returned by schema code.
 * @template {Record<string, unknown>} D
 * @param {unknown} value
 * @param {string} label
 * @returns {D}
 */
function ownObject(value, label) {
  const owned = cloneEditorData(value)
  if (!owned || typeof owned !== 'object' || Array.isArray(owned)) {
    throw new TypeError(`${label} must be a JSON object`)
  }
  return /** @type {D} */ (owned)
}

/**
 * Build one immutable exact-version JSON-data schema.
 *
 * Serialized values must declare the schema's current dataVersion exactly.
 * Local values use encode(). No migration, implicit-version, or compatibility
 * path exists at this boundary.
 *
 * @template {Record<string, unknown>} D
 * @param {VersionedDataSchemaOptions<D>} options
 */
export function createVersionedDataSchema(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Versioned data schema options must be an object')
  }

  const supplied = /** @type {VersionedDataSchemaOptions<D> & Record<string, unknown>} */ ({ ...options })
  for (const key of Object.keys(supplied)) {
    if (!['currentVersion', 'createDefault', 'normalize', 'mapRichText'].includes(key)) {
      throw new TypeError(`Unknown versioned data schema option: ${key}`)
    }
  }

  const currentVersion = assertVersion(supplied.currentVersion, 'currentVersion')
  const createDefault = supplied.createDefault
  const normalize = supplied.normalize
  const mapRichText = supplied.mapRichText

  if (typeof createDefault !== 'function') {
    throw new TypeError('Versioned data schema requires createDefault()')
  }
  if (typeof normalize !== 'function') {
    throw new TypeError('Versioned data schema requires normalize()')
  }
  if (mapRichText !== undefined && typeof mapRichText !== 'function') {
    throw new TypeError('Versioned data schema mapRichText must be a function')
  }

  /** @param {unknown} input @returns {D} */
  const normalizeOwned = input => {
    const ownedInput = ownObject(input, 'Block data input')
    return ownObject(normalize(ownedInput), 'Block data normalizer result')
  }

  const schema = {
    currentVersion,

    /** @returns {D} */
    createDefault() {
      return normalizeOwned(createDefault())
    },

    /**
     * @param {{ dataVersion: number, data: unknown }} input
     * @returns {{ dataVersion: number, data: D }}
     */
    decode(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('Versioned block data input must be an object')
      }
      const candidate = /** @type {{ dataVersion?: unknown, data?: unknown }} */ ({ ...input })
      if (!Object.hasOwn(candidate, 'dataVersion')) {
        throw new TypeError('dataVersion is required')
      }
      const version = assertVersion(candidate.dataVersion, 'dataVersion')
      if (version !== currentVersion) {
        throw new RangeError(`Unsupported data version ${version}; current version is ${currentVersion}`)
      }
      if (!Object.hasOwn(candidate, 'data')) {
        throw new TypeError('Versioned block data input must contain data')
      }
      return {
        dataVersion: currentVersion,
        data: normalizeOwned(candidate.data),
      }
    },

    /**
     * Apply one rich-text transformation to every schema-declared rich field.
     * Returns a detached, normalized value; the caller's data is never mutated.
     * Schemas without rich fields return a detached normalized copy unchanged.
     *
     * @param {D} data
     * @param {(html: string, fieldKey: string) => string} transform
     * @returns {D}
     */
    mapRichText(data, transform) {
      if (typeof transform !== 'function') {
        throw new TypeError('Rich-text transform must be a function')
      }
      const owned = normalizeOwned(data)
      if (mapRichText) mapRichText(owned, transform)
      return normalizeOwned(owned)
    },

    /**
     * @param {D} data
     * @returns {{ dataVersion: number, data: D }}
     */
    encode(data) {
      return {
        dataVersion: currentVersion,
        data: normalizeOwned(data),
      }
    },
  }

  return Object.freeze(schema)
}
