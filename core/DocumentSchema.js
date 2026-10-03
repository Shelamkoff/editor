import { cloneEditorData } from '../shared/cloneEditorData.js'
import { EDITOR_VERSION } from './constants.js'
import { BUILT_IN_DOCUMENT_MIGRATIONS } from './documentMigrations.js'

/**
 * Validates document envelopes and applies an explicit, deterministic
 * migration chain before data reaches plugins or the live block model.
 */
/**
 * @typedef {{
 *   from: string,
 *   to: string,
 *   migrate(document: import('./publicTypes').EditorDocument): import('./publicTypes').EditorDocument,
 * }} DocumentMigration
 */

export class DocumentSchema {
  /** @type {string} */ #currentVersion
  /** @type {'preserve' | 'strict'} */ #versionPolicy
  /** @type {Map<string, DocumentMigration>} */ #migrations = new Map()
  /** @type {import('./types').DiagnosticsSink | null} */ #diagnostics

  /**
   * @param {{
   *   currentVersion?: string,
   *   versionPolicy?: 'preserve' | 'strict',
   *   migrations?: readonly DocumentMigration[],
   *   diagnostics?: import('./types').DiagnosticsSink,
   * }} [options]
   */
  constructor(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('DocumentSchema options must be an object')
    }
    const supplied = /** @type {typeof options} */ ({ ...options })
    const currentVersion = supplied.currentVersion === undefined ? EDITOR_VERSION : supplied.currentVersion
    if (typeof currentVersion !== 'string' || !currentVersion) {
      throw new TypeError('currentVersion must be a non-empty string')
    }
    this.#currentVersion = currentVersion
    const versionPolicy = supplied.versionPolicy === undefined ? 'preserve' : supplied.versionPolicy
    if (versionPolicy !== 'preserve' && versionPolicy !== 'strict') {
      throw new TypeError('versionPolicy must be "preserve" or "strict"')
    }
    this.#versionPolicy = versionPolicy
    this.#diagnostics = supplied.diagnostics ?? null

    const suppliedMigrations = supplied.migrations ?? []
    if (!Array.isArray(suppliedMigrations)) throw new TypeError('migrations must be an array')
    for (let index = 0; index < suppliedMigrations.length; index++) {
      if (!Object.hasOwn(suppliedMigrations, index)) throw new TypeError('migrations must be a dense array')
    }
    const migrations = currentVersion === EDITOR_VERSION
      ? [...BUILT_IN_DOCUMENT_MIGRATIONS, ...suppliedMigrations]
      : suppliedMigrations
    for (const migration of migrations) this.#register(migration)
  }

  get currentVersion() { return this.#currentVersion }

  /**
   * Return an isolated, structurally valid document suitable for rendering.
   * Consumer input and each migration stage remain ownership boundaries.
   * @param {unknown} input
   * @returns {import('./publicTypes').EditorDocument}
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

  /** @param {DocumentMigration} migration */
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
    this.#migrations.set(from, {
      from,
      to,
      migrate: migrate.bind(migration),
    })
  }

  /**
   * @param {unknown} input
   * @param {string} [forcedVersion]
   * @returns {import('./publicTypes').EditorDocument}
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
    const normalizedBlocks = /** @type {import('../shared/documentTypes').EditorBlockData[]} */ (
      cloneEditorData(blocks)
    )
    /** @type {import('./publicTypes').EditorDocument} */
    const normalized = {
      version,
      blocks: normalizedBlocks,
    }
    if (typeof candidate.time === 'number' && Number.isFinite(candidate.time)) {
      normalized.time = candidate.time
    }
    return normalized
  }
}
