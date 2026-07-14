import { cloneEditorData } from '../shared/cloneEditorData.js'
import { EDITOR_VERSION } from './constants.js'

/**
 * Validates document envelopes and applies an explicit, deterministic
 * migration chain before data reaches plugins or the live block model.
 */
export class DocumentSchema {
  /** @type {string} */ #currentVersion
  /** @type {'preserve' | 'strict'} */ #versionPolicy
  /** @type {Map<string, import('./types').DocumentMigration>} */ #migrations = new Map()
  /** @type {import('./Diagnostics').Diagnostics | null} */ #diagnostics

  /**
   * @param {{
   *   currentVersion?: string,
   *   versionPolicy?: 'preserve' | 'strict',
   *   migrations?: import('./types').DocumentMigration[],
   *   diagnostics?: import('./Diagnostics').Diagnostics,
   * }} [options]
   */
  constructor(options = {}) {
    this.#currentVersion = options.currentVersion ?? EDITOR_VERSION
    this.#versionPolicy = options.versionPolicy ?? 'preserve'
    this.#diagnostics = options.diagnostics ?? null

    for (const migration of options.migrations ?? []) {
      this.#register(migration)
    }
  }

  get currentVersion() { return this.#currentVersion }

  /**
   * Return an isolated, structurally valid document suitable for rendering.
   * Consumer input and each migration stage remain ownership boundaries.
   * @param {unknown} input
   * @returns {import('./types').EditorDocument}
   */
  normalize(input) {
    let document = this.#normalizeEnvelope(input)
    const visited = new Set()

    while (document.version !== this.#currentVersion) {
      if (visited.has(document.version)) {
        throw new Error(`Document migration cycle detected at version "${document.version}"`)
      }
      visited.add(document.version)

      const migration = this.#migrations.get(document.version)
      if (!migration) {
        if (this.#versionPolicy === 'strict') {
          this.#diagnostics?.emit('migration.unavailable', {
            fromVersion: document.version,
            toVersion: this.#currentVersion,
          })
          throw new Error(
            `No document migration from version "${document.version}" to "${this.#currentVersion}"`,
          )
        }
        return document
      }

      const source = cloneEditorData(document)
      let migrated
      try {
        migrated = migration.migrate(source)
      } catch (cause) {
        this.#diagnostics?.emit('migration.failed', {
          fromVersion: migration.from,
          toVersion: migration.to,
          errorName: this.#diagnostics.errorName(cause),
        })
        throw new Error(
          `Document migration "${migration.from}" -> "${migration.to}" failed`,
          { cause },
        )
      }
      document = this.#normalizeEnvelope(migrated, migration.to)
      this.#diagnostics?.emit('migration.applied', {
        fromVersion: migration.from,
        toVersion: migration.to,
      })
    }

    return document
  }

  /** @param {import('./types').DocumentMigration} migration */
  #register(migration) {
    if (!migration || typeof migration !== 'object') {
      throw new TypeError('Document migrations must be objects')
    }
    const { from, to, migrate } = migration
    if (typeof from !== 'string' || !from || typeof to !== 'string' || !to) {
      throw new TypeError('Document migrations require non-empty "from" and "to" versions')
    }
    if (from === to) throw new Error(`Document migration cannot target its own version "${from}"`)
    if (typeof migrate !== 'function') {
      throw new TypeError(`Document migration "${from}" -> "${to}" requires migrate()`)
    }
    if (this.#migrations.has(from)) {
      throw new Error(`Duplicate document migration source version "${from}"`)
    }
    this.#migrations.set(from, migration)
  }

  /**
   * @param {unknown} input
   * @param {string} [forcedVersion]
   * @returns {import('./types').EditorDocument}
   */
  #normalizeEnvelope(input, forcedVersion) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      if (this.#versionPolicy === 'strict' || forcedVersion !== undefined) {
        throw new TypeError('Editor document must be an object')
      }
      input = { blocks: [] }
    }

    const candidate = /** @type {Record<string, unknown>} */ (input)
    let blocks = candidate.blocks
    if (!Array.isArray(blocks)) {
      if (this.#versionPolicy === 'strict' || forcedVersion !== undefined) {
        throw new TypeError('Editor document "blocks" must be an array')
      }
      blocks = []
    }

    const declaredVersion = forcedVersion ?? candidate.version
    const version = typeof declaredVersion === 'string' && declaredVersion
      ? declaredVersion
      : this.#currentVersion
    /** @type {import('./types').EditorDocument} */
    const normalized = {
      version,
      blocks: cloneEditorData(blocks),
    }
    if (typeof candidate.time === 'number' && Number.isFinite(candidate.time)) {
      normalized.time = candidate.time
    }
    return normalized
  }
}
