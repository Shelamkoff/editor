import { BLOCK_SELECTOR } from '../constants.js'
import { EditorEvent } from '../editorEvents.js'
import { CrossBlockEditor } from './CrossBlockEditor.js'
import { PasteRouter } from './PasteRouter.js'
import { pasteHtml, pastePlainText } from './pasteInsert.js'
import { hydrateInlinePlugins } from '../hydrateInlinePlugins.js'
import { cloneEditorData } from '../../shared/cloneEditorData.js'

const MIME_TYPE = 'application/x-rector-editor'

/**
 * Extract plain text and HTML from a DOM Range.
 * @param {Range} range
 * @returns {{ text: string, html: string }}
 */
function extractRangeContent(range) {
  const text = range.toString()
  const frag = range.cloneContents()
  const div = document.createElement('div')
  div.appendChild(frag)
  return { text, html: div.innerHTML }
}

/**
 * Copy a cross-block range as both plain text and HTML via async Clipboard API.
 * Used from keydown handler where ClipboardEvent.clipboardData is unavailable.
 *
 * @param {KeyboardEvent} e
 * @param {Range} crossRange
 * @returns {boolean} whether the async Clipboard API handled the operation
 */
function copyRange(e, crossRange) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false

  e.preventDefault()
  const { text, html } = extractRangeContent(crossRange)

  navigator.clipboard.write([
    new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    }),
  ]).catch((err) => {
    console.warn('[Clipboard] Failed to write rich clipboard, falling back to plain text:', err)
    navigator.clipboard?.writeText?.(text).catch(() => {})
  })
  return true
}

/**
 * Editor clipboard surface — listens to copy/cut/paste/keydown on the editor
 * root and dispatches to the right helper:
 *  - selected blocks (`block.selected`): handled inline (whole-block copy/cut)
 *  - cross-block range: delegated to `CrossBlockEditor`
 *  - paste: routed by MIME type → custom-data, files, html, plain text,
 *    each via `PasteRouter` lookup or `pasteInsert.js` helpers.
 */
export class Clipboard {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('../types').IBlockManager} */
  #blocks

  /** @type {import('../types').ISelectionManager} */
  #selection

  /** @type {Map<string, import('../types').BlockPlugin>} */
  #plugins

  /** @type {string} */
  #defaultBlockType

  /** @type {import('../types').ICrossBlockSelection} */
  #crossBlockSelection

  /** @type {import('../types').IEventBus} */
  #events

  /** @type {import('../CommandDispatcher').CommandDispatcher} */
  #commands

  /** @type {import('../Diagnostics').Diagnostics | null} */
  #diagnostics

  /** @type {PasteRouter} */
  #router

  /** @type {CrossBlockEditor} */
  #crossEditor

  /** @type {import('../BlockOperations').BlockOperations} */
  #blockOps

  /** @type {() => import('../types').EditorDocument} */
  #captureSnapshot

  /** @type {import('../InlinePluginRegistry').InlinePluginRegistry} */
  #inlinePluginRegistry

  /** @type {import('../types').InlinePluginContext} */
  #inlinePluginCtx

  /** @type {(e: Event) => void} */ #onCopy
  /** @type {(e: Event) => void} */ #onCut
  /** @type {(e: Event) => void} */ #onPaste
  /** @type {(e: Event) => void} */ #onKeyDown

  /**
   * Predicate: returns true when an interactive UI overlay is open.
   * @type {(() => boolean) | null}
   */
  #isUIActive = null

  /** @type {Set<{ cancelled: boolean, cleanup(): void }>} */
  #pendingPastes = new Set()

  /** @type {boolean} */
  #destroyed = false

  /**
   * @typedef {Object} ClipboardConfig
   * @property {import('../types').IBlockManager} blocks
   * @property {import('../types').ISelectionManager} selection
   * @property {Map<string, import('../types').BlockPlugin>} plugins
   * @property {string} defaultBlockType
   * @property {import('../types').ICrossBlockSelection} crossBlockSelection
   * @property {import('../types').IEventBus} events
   * @property {import('../CommandDispatcher').CommandDispatcher} commands
   * @property {import('../BlockOperations').BlockOperations} blockOps
   * @property {() => import('../types').EditorDocument} captureSnapshot
   * @property {import('../InlinePluginRegistry').InlinePluginRegistry} inlinePluginRegistry
   * @property {import('../types').InlinePluginContext} inlinePluginCtx
   * @property {import('../Diagnostics').Diagnostics} [diagnostics]
   * @property {(() => boolean)} [uiActivePredicate]
   */

  /**
   * @param {HTMLElement} rootEl
   * @param {ClipboardConfig} config
   */
  constructor(rootEl, config) {
    const {
      blocks, selection, plugins, defaultBlockType, crossBlockSelection,
      events, commands, blockOps, captureSnapshot, inlinePluginRegistry,
      inlinePluginCtx, diagnostics, uiActivePredicate,
    } = config
    this.#rootEl = rootEl
    this.#blocks = blocks
    this.#selection = selection
    this.#plugins = plugins
    this.#defaultBlockType = defaultBlockType
    this.#crossBlockSelection = crossBlockSelection
    this.#events = events
    this.#commands = commands
    this.#diagnostics = diagnostics ?? null
    this.#captureSnapshot = captureSnapshot
    this.#inlinePluginRegistry = inlinePluginRegistry
    this.#inlinePluginCtx = inlinePluginCtx
    this.#isUIActive = uiActivePredicate ?? null

    this.#blockOps = blockOps
    this.#router = new PasteRouter(plugins.values())
    this.#crossEditor = new CrossBlockEditor(
      rootEl, blocks, selection, crossBlockSelection, events, defaultBlockType,
    )

    this.#onCopy = (e) => this.#handleCopy(/** @type {ClipboardEvent} */ (e))
    this.#onCut = (e) => this.#handleCut(/** @type {ClipboardEvent} */ (e))
    this.#onPaste = (e) => {
      void this.#observePaste(/** @type {ClipboardEvent} */ (e)).catch((err) => {
        console.error('[Clipboard] Failed to paste:', err)
      })
    }
    this.#onKeyDown = (e) => this.#handleKeyDown(/** @type {KeyboardEvent} */ (e))

    rootEl.addEventListener('copy', this.#onCopy, true)
    rootEl.addEventListener('cut', this.#onCut, true)
    rootEl.addEventListener('paste', this.#onPaste, true)
    rootEl.addEventListener('keydown', this.#onKeyDown, true)
  }

  destroy() {
    this.#destroyed = true
    this.#rootEl.removeEventListener('copy', this.#onCopy, true)
    this.#rootEl.removeEventListener('cut', this.#onCut, true)
    this.#rootEl.removeEventListener('paste', this.#onPaste, true)
    this.#rootEl.removeEventListener('keydown', this.#onKeyDown, true)
    for (const pending of [...this.#pendingPastes]) {
      pending.cancelled = true
      pending.cleanup()
    }
  }

  // ── Keyboard shortcuts (cross-block range) ──────────────────────────────────

  /** @param {KeyboardEvent} e */
  #handleKeyDown(e) {
    // Skip when interactive UI overlay is open (dropdown, actions panel).
    if (this.#isUIActive?.()) return

    // Skip events from toolbar UI (inputs, dropdowns) — only handle block content keys.
    const target = /** @type {HTMLElement} */ (e.target)
    if (target !== this.#rootEl && !target.closest?.(BLOCK_SELECTOR)) return

    const crossRange = this.#crossBlockSelection.range
    if (!crossRange) return

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      e.stopPropagation()
      this.#crossEditor.setCaretToRangeEnd(crossRange)
      this.#crossEditor.deleteContent(crossRange, (...blocks) => this.#notifyChanged(...blocks))
      return
    }

    if (!(e.ctrlKey || e.metaKey)) return

    if (e.code === 'KeyX') {
      if (!copyRange(e, crossRange)) return
      e.stopPropagation()
      this.#crossEditor.setCaretToRangeEnd(crossRange)
      this.#crossEditor.deleteContent(crossRange, (...blocks) => this.#notifyChanged(...blocks))
    } else if (e.code === 'KeyC') {
      if (copyRange(e, crossRange)) e.stopPropagation()
    }
  }

  // ── Copy ────────────────────────────────────────────────────────────────────

  /** @param {ClipboardEvent} e */
  #handleCopy(e) {
    const crossRange = this.#crossBlockSelection.range
    if (crossRange) {
      e.preventDefault()
      const { text, html } = extractRangeContent(crossRange)
      e.clipboardData?.setData('text/plain', text)
      e.clipboardData?.setData('text/html', html)
      return
    }

    const selectedBlocks = this.#blocks.getSelectedBlocks()
    if (selectedBlocks.length > 0) {
      e.preventDefault()
      const canonical = new Map(
        this.#captureSnapshot().blocks.map(block => [block.id, block]),
      )
      const blocksData = selectedBlocks.map(block => canonical.get(block.id) ?? block.save())
      const html = selectedBlocks.map((b) => b.contentElement.innerHTML).join('\n')
      const text = selectedBlocks.map((b) => b.contentElement.textContent).join('\n')
      e.clipboardData?.setData('text/plain', text)
      e.clipboardData?.setData('text/html', html)
      e.clipboardData?.setData(MIME_TYPE, JSON.stringify(blocksData))
      return
    }

  }

  // ── Cut ─────────────────────────────────────────────────────────────────────

  /** @param {ClipboardEvent} e */
  #handleCut(e) {
    this.#handleCopy(e)

    const blocks = this.#blocks
    const crossRange = this.#crossBlockSelection.range
    if (crossRange) {
      this.#crossEditor.deleteContent(crossRange, (...blocks) => this.#notifyChanged(...blocks))
      return
    }

    if (this.#blocks.hasSelectedBlocks()) {
      this.#events.emit(EditorEvent.UNDO_BATCH_START)
      try {
        const result = blocks.removeSelected(this.#defaultBlockType)
        if (result) {
          blocks.setCurrentIndex(result.focusIndex)
          const focusBlock = blocks.getBlockByIndex(result.focusIndex)
          if (focusBlock) {
            focusBlock.focus()
            this.#selection.setCaretToBlock(focusBlock.id, 'start')
          }
        }
      } finally {
        this.#events.emit(EditorEvent.UNDO_BATCH_END)
      }
      return
    }

  }

  // ── Paste ───────────────────────────────────────────────────────────────────

  /** @param {ClipboardEvent} event */
  async #observePaste(event) {
    const startedAt = this.#diagnostics?.enabled ? this.#diagnostics.now() : 0
    try {
      await this.#handlePaste(event)
    } catch (error) {
      this.#diagnostics?.emit('paste.failed', {
        operation: 'clipboard.paste',
        errorName: this.#diagnostics.errorName(error),
      })
      throw error
    } finally {
      if (startedAt && this.#diagnostics) {
        const durationMs = this.#diagnostics.now() - startedAt
        if (durationMs >= this.#diagnostics.threshold('pasteMs')) {
          this.#diagnostics.emit('paste.slow', { operation: 'clipboard.paste', durationMs })
        }
      }
    }
  }

  /** @param {ClipboardEvent} e */
  async #handlePaste(e) {
    const target = /** @type {HTMLElement | null} */ (e.target)
    if (target) {
      // Only handle paste inside content blocks.
      if (!target.closest(BLOCK_SELECTOR)) return
      const closestNonEditable = target.closest('[contenteditable="false"]')
      if (closestNonEditable && closestNonEditable.closest(BLOCK_SELECTOR)) return
    }

    const pasteStartBlock = target
      ? this.#blocks.getBlockByChildNode(target)
      : this.#blocks.getCurrentBlock()

    e.preventDefault()

    // File uploads are prepared outside the live document. This keeps a slow
    // plugin promise from holding the editor-wide undo batch open while the
    // user continues editing. The completed blocks are committed once.
    const customData = e.clipboardData?.getData(MIME_TYPE)
    const files = Array.from(e.clipboardData?.files ?? [])
    if (!customData && files.length > 0) {
      const crossRange = this.#crossBlockSelection.range?.cloneRange() ?? null
      const selectedIds = crossRange
        ? []
        : this.#blocks.getSelectedBlocks().map(block => block.id)
      await this.#pasteFiles(files, {
        crossRange,
        selectedIds,
        anchorBlockId: pasteStartBlock?.id,
        fallbackIndex: this.#blocks.getCurrentIndex() + 1,
      })
      return
    }

    this.#events.emit(EditorEvent.UNDO_BATCH_START)

    try {
      // A mouse cross-selection also paints whole blocks as selected for UI
      // purposes, but paste must replace only its text range. Route that case
      // through the range editor before considering whole-block selection.
      const crossRange = this.#crossBlockSelection.range
      let result = null
      if (crossRange) {
        this.#crossEditor.deleteContent(crossRange, (...blocks) => this.#notifyChanged(...blocks))
      } else {
        result = this.#blocks.removeSelected(this.#defaultBlockType)
      }

      // Determine the insertion point after selection replacement.
      const insertIndex = result ? result.focusIndex : this.#blocks.getCurrentIndex() + 1
      const hadSelection = !!result

      // ── 1. Internal MIME (block-level paste) ──
      if (customData && this.#pasteCustomMime(customData, insertIndex)) return

      // ── 3. Plain text URL/pattern matching (before HTML) ──
      const html = e.clipboardData?.getData('text/html')
      const plainText = e.clipboardData?.getData('text/plain') || ''

      if (plainText && this.#handlePatternPaste(plainText)) return

      if (hadSelection) {
        this.#ensureCaretBlock(Math.min(insertIndex, this.#blocks.getBlockCount()))
      }

      // ── 4. HTML / plain text ──
      this.#pasteContent(html, plainText)
      const pasteEndBlock = this.#blocks.getCurrentBlock()
      this.#events.emit(EditorEvent.PASTE_APPLIED, {
        ...(pasteStartBlock ? { startBlockId: pasteStartBlock.id } : {}),
        ...(pasteEndBlock ? { endBlockId: pasteEndBlock.id } : {}),
      })
    } finally {
      // Async paste work (for example an image upload) remains one atomic
      // history operation, and errors cannot leave UndoManager batching open.
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
    }
  }

  /**
   * Paste HTML or plain text content at the current caret position.
   * @param {string} [html]
   * @param {string} [plainText]
   */
  #pasteContent(html, plainText) {
    const ctx = {
      blocks: this.#blocks,
      selection: this.#selection,
      blockOps: this.#blockOps,
      defaultBlockType: this.#defaultBlockType,
      router: this.#router,
      notifyChanged: (...blocks) => this.#notifyChanged(...blocks),
    }

    if (html) {
      pasteHtml(html, ctx)
    } else if (plainText) {
      pastePlainText(plainText, ctx)
    }
  }

  /**
   * @param {string} customData
   * @param {number} insertIndex
   */
  #pasteCustomMime(customData, insertIndex) {
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(customData)
      if (!Array.isArray(parsed) || parsed.length === 0) return false

      const blocksData = parsed.filter(blockData => (
        blockData
        && typeof blockData === 'object'
        && typeof blockData.type === 'string'
        && blockData.data
        && typeof blockData.data === 'object'
      ))
      if (blocksData.length === 0) return false

      for (const blockData of blocksData) {
        const type = this.#plugins.has(blockData.type) ? blockData.type : this.#defaultBlockType
        const inline = blockData.inline && typeof blockData.inline === 'object'
          ? blockData.inline
          : undefined
        const inserted = this.#blocks.insert(type, blockData.data, insertIndex, undefined, inline)
        hydrateInlinePlugins(inserted.contentElement, this.#inlinePluginRegistry, this.#inlinePluginCtx)
        insertIndex++
      }
      // Focus the last inserted block once (avoid intermediate focus shifts).
      const lastInserted = this.#blocks.getBlockByIndex(insertIndex - 1)
      if (lastInserted) {
        this.#blocks.setCurrentIndex(insertIndex - 1)
        this.#selection.setCaretToBlock(lastInserted.id, 'end')
        lastInserted.focus()
      }
      return true
    } catch (err) {
      console.error('[Clipboard] Failed to parse custom data:', err)
      return false
    }
  }

  /**
   * Prepare uploads outside the model, then commit every successful file as
   * one synchronous history operation.
   * @param {File[]} files
   * @param {{ crossRange: Range | null, selectedIds: string[], anchorBlockId?: string, fallbackIndex: number }} target
   */
  async #pasteFiles(files, target) {
    const pendingHost = document.createElement('div')
    pendingHost.className = 'oe-pending-pastes'
    pendingHost.setAttribute('aria-live', 'polite')

    const anchor = target.anchorBlockId
      ? this.#blocks.getBlockById(target.anchorBlockId)
      : this.#blocks.getCurrentBlock()
    if (anchor?.element.parentNode) anchor.element.after(pendingHost)

    const prepared = (await Promise.all(
      files.map(file => this.#prepareFilePaste(file, pendingHost)),
    )).filter(Boolean)
    pendingHost.remove()

    if (this.#destroyed || prepared.length === 0) return

    this.#events.emit(EditorEvent.UNDO_BATCH_START)
    try {
      let result = null
      if (target.crossRange
          && this.#rootEl.contains(target.crossRange.startContainer)
          && this.#rootEl.contains(target.crossRange.endContainer)) {
        this.#crossEditor.deleteContent(target.crossRange, (...blocks) => this.#notifyChanged(...blocks))
      } else if (target.selectedIds.length > 0) {
        const selected = new Set(target.selectedIds)
        this.#blocks.clearSelection()
        for (const block of this.#blocks) block.selected = selected.has(block.id)
        result = this.#blocks.removeSelected(this.#defaultBlockType)
      }

      let insertIndex
      if (result) {
        insertIndex = result.focusIndex
      } else {
        const liveAnchorIndex = target.anchorBlockId
          ? this.#blocks.getBlockIndex(target.anchorBlockId)
          : -1
        insertIndex = liveAnchorIndex >= 0
          ? liveAnchorIndex + 1
          : Math.min(target.fallbackIndex, this.#blocks.getBlockCount())
      }

      const current = target.anchorBlockId
        ? this.#blocks.getBlockById(target.anchorBlockId)
        : null
      let replaceEmpty = prepared.length === 1
        && current?.isEmpty()
        && current.type === this.#defaultBlockType
      if (replaceEmpty) insertIndex = this.#blocks.getBlockIndex(current.id)

      for (const entry of prepared) {
        const inserted = this.#blocks.insert(entry.type, entry.data, insertIndex)
        hydrateInlinePlugins(inserted.contentElement, this.#inlinePluginRegistry, this.#inlinePluginCtx)
        if (replaceEmpty) {
          this.#blocks.remove(insertIndex + 1)
          replaceEmpty = false
        }
        insertIndex++
      }

      const lastInserted = this.#blocks.getBlockByIndex(insertIndex - 1)
      if (lastInserted) {
        this.#blocks.setCurrentIndex(insertIndex - 1)
        lastInserted.focus()
      } else {
        this.#rootEl.focus()
      }

      this.#events.emit(EditorEvent.PASTE_APPLIED, {
        ...(target.anchorBlockId ? { startBlockId: target.anchorBlockId } : {}),
        ...(lastInserted ? { endBlockId: lastInserted.id } : {}),
      })
    } finally {
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
    }
  }

  /**
   * @param {File} file
   * @param {HTMLElement} pendingHost
   * @returns {Promise<{ type: string, data: Record<string, unknown> } | null>}
   */
  async #prepareFilePaste(file, pendingHost) {
    const plugin = this.#router.findByFile(file.type)
    if (!plugin?.onPaste) return null

    let element
    let shell
    /** @type {{ cancelled: boolean, cleanup(): void } | null} */
    let pending = null
    try {
      const initialData = plugin.onPaste({ type: 'file', file })
      if (!initialData) return null

      element = plugin.render(initialData, { mutate: (operation) => operation() })
      if (!(element instanceof HTMLElement)) {
        throw new TypeError(`File paste plugin "${plugin.type}" did not return an HTMLElement`)
      }

      shell = document.createElement('div')
      shell.className = 'oe-block oe-block--pending-paste'
      shell.dataset.blockType = plugin.type
      shell.appendChild(element)
      pendingHost.appendChild(shell)

      let cleaned = false
      pending = {
        cancelled: false,
        cleanup: () => {
          if (cleaned) return
          cleaned = true
          try { plugin.destroy?.(element) } catch (error) {
            console.warn(`[Clipboard] Failed to destroy pending "${plugin.type}" paste:`, error)
          }
          shell?.remove()
          this.#pendingPastes.delete(pending)
        },
      }
      this.#pendingPastes.add(pending)

      await plugin.waitForPaste?.(element)
      if (this.#destroyed || pending.cancelled) return null

      const saved = plugin.save(element)
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        throw new TypeError(`File paste plugin "${plugin.type}" returned invalid data`)
      }
      if (plugin.validate && !plugin.validate(saved)) return null
      return { type: plugin.type, data: cloneEditorData(saved) }
    } catch (error) {
      console.error(`[Clipboard] Failed to prepare file paste with "${plugin.type}":`, error)
      return null
    } finally {
      pending?.cleanup()
    }
  }

  /**
   * @param {string} text
   * @returns {boolean}
   */
  #handlePatternPaste(text) {
    const plugin = this.#router.findByPattern(text)
    if (!plugin?.onPaste) return false
    const data = plugin.onPaste({ type: 'pattern', data: text })
    if (!data) return false

    this.#blockOps.replaceEmptyOrInsert(plugin.type, data)
    return true
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** @param {number} index */
  #ensureCaretBlock(index) {
    const newBlock = this.#blocks.insert(this.#defaultBlockType, undefined, index)
    const newIdx = this.#blocks.getBlockIndex(newBlock.id)
    this.#blocks.setCurrentIndex(newIdx)

    newBlock.focus()
    const sel = window.getSelection()
    if (sel) {
      const range = document.createRange()
      range.setStart(newBlock.contentElement, 0)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }

  /**
   * Invalidate every existing block mutated directly by a paste operation.
   * With no explicit targets, preserve the legacy current-block fallback for
   * cross-block editor callbacks that already position current precisely.
   * @param {...import('../types').IBlock} affected
   */
  #notifyChanged(...affected) {
    const targets = affected.length > 0
      ? affected
      : [this.#blocks.getCurrentBlock()].filter(Boolean)
    this.#commands.commitExternalMany(targets)
  }
}
