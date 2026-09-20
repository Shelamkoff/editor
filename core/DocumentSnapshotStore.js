import { EDITOR_VERSION } from './constants.js'
import { collectInlineSerializationIds, serializeInlineHtml } from '../shared/inlineMarshal.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { resolveValidationMode } from '../shared/validationMode.js'

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

  /** @type {WeakMap<import('./types').IBlock, { version: number, data: import('./types').BlockData, inlineIds: Map<string, string[]> }>} */
  #cache = new WeakMap()

  /** @type {import('./Diagnostics').Diagnostics | null} */
  #diagnostics

  /** @type {string} */
  #documentVersion

  /** Blocks whose validation issue is currently being reported on this stack. */
  /** @type {WeakSet<import('./types').IBlock>} */
  #reportingValidation = new WeakSet()

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
    this.#validationMode = resolveValidationMode(config.validationMode)
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
    /** @type {Array<{ block: import('./types').IBlock, issue: import('./types').BlockValidationIssue }>} */
    const reports = []

    for (const block of this.#blocks) {
      const { data: canonical, issue } = this.#snapshotBlock(block)
      snapshots.push(isolate ? cloneEditorData(canonical) : canonical)
      if (!issue) continue

      if (this.#validationMode === 'strict') {
        this.#reportValidation(block, issue)
        throw new Error('Invalid block data for "' + block.type + '" (' + block.id + ')')
      }
      reports.push({ block, issue })
    }

    const document = {
      time: Date.now(),
      version: this.#documentVersion,
      blocks: snapshots,
    }

    // Consumer observers run only after the complete preserve-mode snapshot is
    // assembled. They may inspect or even mutate the live editor, but cannot
    // retroactively turn one save() result into a mixture of pre/post-observer
    // block states.
    for (const { block, issue } of reports) this.#reportValidation(block, issue)

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
    if (cached?.version === block.version) return { data: cached.data, issue: null }

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

    const inlineIds = { previous: cached?.inlineIds ?? new Map(), current: new Map() }
    const registry = this.#inlinePluginRegistry
    if (registry && typeof block.plugin.mapTextFields === 'function') {
      /** @type {Record<string, import('../renderer/types').InlineWidget>} */
      const inline = {}
      const usedInlineIds = new Set()
      const liveInlineIds = new Set()
      // A later field's literal must reserve its ID before an earlier field's
      // widget can claim it. The preflight is non-transforming.
      block.plugin.mapTextFields(
        /** @type {Record<string, unknown>} */ (snapshot.data),
        (html) => {
          collectInlineSerializationIds(html, registry, usedInlineIds, liveInlineIds, block.contentElement.ownerDocument)
          return html
        },
      )
      block.plugin.mapTextFields(
        /** @type {Record<string, unknown>} */ (snapshot.data),
        (html) => {
          const result = serializeInlineHtml(html, registry, usedInlineIds, snapshot.inline, block.contentElement.ownerDocument, liveInlineIds, true, inlineIds)
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

    /** @type {import('./types').BlockValidationIssue | null} */
    let issue = null
    if (typeof block.plugin.validate === 'function') {
      let valid
      try {
        valid = block.plugin.validate(snapshot.data)
      } catch {
        valid = false
      }
      if (!valid) {
        issue = {
          blockId: block.id,
          type: block.type,
          data: cloneEditorData(snapshot.data),
        }
      }
    }

    const canonical = cloneEditorData(snapshot)
    // Strict invalid data must never enter the cache, otherwise a later save()
    // could reuse it without re-running the strict validation decision.
    if (!(issue && this.#validationMode === 'strict')) {
      this.#cache.set(block, { version: block.version, data: canonical, inlineIds: inlineIds.current })
    }
    return { data: canonical, issue }
  }

  /**
   * @param {import('./types').IBlock} block
   * @param {import('./types').BlockValidationIssue} issue
   */
  #reportValidation(block, issue) {
    const observer = this.#onValidationError
    if (typeof observer !== 'function' || this.#reportingValidation.has(block)) return

    this.#reportingValidation.add(block)
    let result
    try {
      result = observer(issue)
    } catch (error) {
      this.#reportingValidation.delete(block)
      console.warn('[DocumentSnapshotStore] Validation observer failed:', error)
      return
    }

    let then
    try {
      then = result && /** @type {any} */ (result).then
    } catch (error) {
      this.#reportingValidation.delete(block)
      console.warn('[DocumentSnapshotStore] Validation observer failed:', error)
      return
    }

    if (typeof then === 'function') {
      new Promise((resolve, reject) => then.call(result, resolve, reject))
        .catch(error => console.warn('[DocumentSnapshotStore] Validation observer failed:', error))
        .finally(() => this.#reportingValidation.delete(block))
    } else {
      this.#reportingValidation.delete(block)
    }
  }

}
