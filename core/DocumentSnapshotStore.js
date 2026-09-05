import { EDITOR_VERSION } from './constants.js'
import { serializeInlineHtml } from '../shared/inlineMarshal.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'

/**
 * Core-owned canonical document store.
 *
 * Internal snapshots structurally share unchanged block objects for history
 * performance. Only isolated copies may cross the public API boundary.
 */
export class DocumentSnapshotStore {
  /** @type {import('./types').IBlockReader} */
  #blocks

  /** @type {import('./InlinePluginRegistry').InlinePluginRegistry | null} */
  #inlinePluginRegistry

  /** @type {'preserve' | 'strict'} */
  #validationMode

  /** @type {import('./types').EditorConfig['onValidationError']} */
  #onValidationError

  /** @type {WeakMap<import('./types').IBlock, { version: number, data: import('./types').BlockData }>} */
  #cache = new WeakMap()

  /** @type {import('./Diagnostics').Diagnostics | null} */
  #diagnostics

  /** @type {string} */
  #documentVersion

  /**
   * @param {import('./types').IBlockReader} blocks
   * @param {import('./InlinePluginRegistry').InlinePluginRegistry | null} inlinePluginRegistry
   * @param {Pick<import('./types').EditorConfig, 'validationMode' | 'onValidationError'>} config
   * @param {import('./Diagnostics').Diagnostics} [diagnostics]
   * @param {string} [initialVersion]
   */
  constructor(blocks, inlinePluginRegistry, config, diagnostics, initialVersion = EDITOR_VERSION) {
    this.#blocks = blocks
    this.#inlinePluginRegistry = inlinePluginRegistry
    this.#validationMode = config.validationMode ?? 'preserve'
    this.#onValidationError = config.onValidationError
    this.#diagnostics = diagnostics ?? null
    this.#documentVersion = initialVersion
  }

  /** @param {string} version */
  setDocumentVersion(version) {
    this.#documentVersion = version
  }

  /** Return a consumer-owned document. */
  save() {
    return this.#build(true)
  }

  /**
   * Return a structurally shared core snapshot.
   * @internal Never expose this result to consumers.
   */
  capture() {
    return this.#build(false)
  }

  /** @param {boolean} isolate */
  #build(isolate) {
    const startedAt = this.#diagnostics?.enabled ? this.#diagnostics.now() : 0
    const snapshots = []
    for (const block of this.#blocks) {
      const canonical = this.#snapshotBlock(block)
      snapshots.push(isolate ? cloneEditorData(canonical) : canonical)
    }

    const document = {
      time: Date.now(),
      version: this.#documentVersion,
      blocks: snapshots,
    }
    if (startedAt && this.#diagnostics) {
      const durationMs = this.#diagnostics.now() - startedAt
      if (durationMs >= this.#diagnostics.threshold('saveMs')) {
        this.#diagnostics.emit('save.slow', { durationMs })
      }
    }
    return document
  }

  /** @param {import('./types').IBlock} block */
  #snapshotBlock(block) {
    const cached = this.#cache.get(block)
    if (cached?.version === block.version) return cached.data

    let snapshot
    try {
      snapshot = block.save()
    } catch (cause) {
      this.#diagnostics?.emit('save.failed', {
        blockType: block.type,
        errorName: this.#diagnostics.errorName(cause),
      })
      throw new Error(`[DocumentSnapshotStore] Failed to save block ${block.id} (${block.type})`, { cause })
    }

    const registry = this.#inlinePluginRegistry
    if (registry && typeof block.plugin.mapTextFields === 'function') {
      /** @type {Record<string, import('../renderer/types').InlineWidget>} */
      const inline = {}
      const usedInlineIds = new Set()
      block.plugin.mapTextFields(
        /** @type {Record<string, unknown>} */ (snapshot.data),
        (html) => {
          const result = serializeInlineHtml(html, registry, usedInlineIds, snapshot.inline)
          for (const [id, widget] of Object.entries(result.inline)) {
            Object.defineProperty(inline, id, {
              value: widget,
              enumerable: true,
              configurable: true,
              writable: true,
            })
          }
          return result.html
        },
      )
      if (Object.keys(inline).length > 0) snapshot.inline = inline
      else delete snapshot.inline
    }

    if (typeof block.plugin.validate === 'function') {
      let valid
      try {
        valid = block.plugin.validate(snapshot.data)
      } catch {
        valid = false
      }
      if (!valid) {
        const issue = {
          blockId: block.id,
          type: block.type,
          data: cloneEditorData(snapshot.data),
        }
        this.#onValidationError?.(issue)
        if (this.#validationMode === 'strict') {
          throw new Error('Invalid block data for "' + block.type + '" (' + block.id + ')')
        }
      }
    }

    const canonical = cloneEditorData(snapshot)
    this.#cache.set(block, { version: block.version, data: canonical })
    return canonical
  }
}
