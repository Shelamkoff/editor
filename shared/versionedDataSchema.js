// @ts-check
import { cloneEditorData } from './cloneEditorData.js'

/**
 * @template {Record<string, unknown>} D
 * @typedef {{
 *   currentVersion: number,
 *   legacyVersion: number,
 *   createDefault: () => D,
 *   normalize: (input: any) => D,
 *   mapRichText?: (data: D, transform: (html: string, fieldKey: string) => string) => void,
 *   migrations?: Array<{
 *     from: number,
 *     to: number,
 *     migrate: (input: any) => unknown,
 *   }>,
 * }} VersionedDataSchemaOptions
 */

/** @param {unknown} value @param {string} label */
function assertVersion(value, label) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new RangeError(`${label} must be a positive safe integer`)
  }
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
 * Build one immutable versioned JSON-data schema.
 *
 * The helper owns every trust-boundary value before user supplied schema code
 * can mutate it. Migrations form a single strictly-forward chain keyed by
 * their source version; missing links and future versions are rejected.
 *
 * @template {Record<string, unknown>} D
 * @param {VersionedDataSchemaOptions<D>} options
 */
export function createVersionedDataSchema(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Versioned data schema options must be an object')
  }

  const currentVersion = options.currentVersion
  const legacyVersion = options.legacyVersion
  const createDefault = options.createDefault
  const normalize = options.normalize
  const mapRichText = options.mapRichText
  const suppliedMigrations = options.migrations ?? []

  assertVersion(currentVersion, 'currentVersion')
  assertVersion(legacyVersion, 'legacyVersion')
  if (legacyVersion > currentVersion) {
    throw new RangeError('legacyVersion cannot be greater than currentVersion')
  }
  if (typeof createDefault !== 'function') {
    throw new TypeError('Versioned data schema requires createDefault()')
  }
  if (typeof normalize !== 'function') {
    throw new TypeError('Versioned data schema requires normalize()')
  }
  if (mapRichText !== undefined && typeof mapRichText !== 'function') {
    throw new TypeError('Versioned data schema mapRichText must be a function')
  }
  if (!Array.isArray(suppliedMigrations)) {
    throw new TypeError('Versioned data schema migrations must be an array')
  }

  /** @type {Map<number, { to: number, migrate: (input: any) => unknown }>} */
  const migrations = new Map()
  for (let index = 0; index < suppliedMigrations.length; index++) {
    if (!Object.hasOwn(suppliedMigrations, index)) {
      throw new TypeError('Versioned data schema migrations must be a dense array')
    }
    const descriptor = suppliedMigrations[index]
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
      throw new TypeError('Data migrations must be objects')
    }

    const from = descriptor.from
    const to = descriptor.to
    const migrate = descriptor.migrate
    assertVersion(from, 'Data migration from')
    assertVersion(to, 'Data migration to')
    if (to <= from) {
      throw new RangeError(`Data migration ${from} -> ${to} must advance to a greater version`)
    }
    if (to > currentVersion) {
      throw new RangeError(`Data migration ${from} -> ${to} exceeds current version ${currentVersion}`)
    }
    if (typeof migrate !== 'function') {
      throw new TypeError(`Data migration ${from} -> ${to} requires migrate()`)
    }
    if (migrations.has(from)) {
      throw new Error(`Duplicate data migration source version ${from}`)
    }
    migrations.set(from, { to, migrate: migrate.bind(descriptor) })
  }

  /** @param {unknown} input @returns {D} */
  const normalizeOwned = input => {
    const ownedInput = ownObject(input, 'Block data input')
    return ownObject(normalize(ownedInput), 'Block data normalizer result')
  }

  const schema = {
    currentVersion,
    legacyVersion,

    /** @returns {D} */
    createDefault() {
      return normalizeOwned(createDefault())
    },

    /**
     * @param {{ dataVersion?: number, data: unknown }} input
     * @returns {{ dataVersion: number, data: D }}
     */
    decode(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('Versioned block data input must be an object')
      }

      // Observe the two envelope members once. Optional dataVersion may be
      // explicitly undefined at internal call sites; omission and undefined
      // have the same legacy-input meaning without weakening JSON validation
      // of the actual persisted data payload.
      const candidate = /** @type {{ dataVersion?: unknown, data?: unknown }} */ (input)
      const suppliedVersion = Object.hasOwn(candidate, 'dataVersion')
        ? candidate.dataVersion
        : undefined
      const suppliedData = candidate.data
      const version = suppliedVersion === undefined ? legacyVersion : suppliedVersion
      assertVersion(version, 'dataVersion')
      if (Number(version) > currentVersion) {
        throw new Error(`Unsupported future data version ${version}; current version is ${currentVersion}`)
      }

      let cursor = Number(version)
      let data = ownObject(suppliedData, 'Block data input')
      while (cursor < currentVersion) {
        const migration = migrations.get(cursor)
        if (!migration) {
          throw new Error(`No data migration from version ${cursor} to ${currentVersion}`)
        }
        const migrationInput = ownObject(data, `Data migration ${cursor} input`)
        data = ownObject(
          migration.migrate(migrationInput),
          `Data migration ${cursor} -> ${migration.to} result`,
        )
        cursor = migration.to
      }

      return {
        dataVersion: currentVersion,
        data: normalizeOwned(data),
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
