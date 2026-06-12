import { BLOCK_SELECTOR } from '../constants.js'
import { EditorEvent } from '../editorEvents.js'
import { CrossBlockEditor } from './CrossBlockEditor.js'
import { PasteRouter } from './PasteRouter.js'
import { pasteHtml, pastePlainText } from './pasteInsert.js'

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
 */
function copyRange(e, crossRange) {
  e.preventDefault()
  const { text, html } = extractRangeContent(crossRange)

  navigator.clipboard.write([
    new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    }),
  ]).catch((err) => {
    console.warn('[Clipboard] Failed to write rich clipboard, falling back to plain text:', err)
    navigator.clipboard.writeText(text).catch(() => {})
  })
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

  /** @type {PasteRouter} */
  #router

  /** @type {CrossBlockEditor} */
  #crossEditor

  /** @type {import('../BlockOperations').BlockOperations} */
  #blockOps

  /** @type {(e: Event) => void} */ #onCopy
  /** @type {(e: Event) => void} */ #onCut
  /** @type {(e: Event) => void} */ #onPaste
  /** @type {(e: Event) => void} */ #onKeyDown

  /**
   * Predicate: returns true when an interactive UI overlay is open.
   * @type {(() => boolean) | null}
   */
  #isUIActive = null

  /**
   * @typedef {Object} ClipboardConfig
   * @property {import('../types').IBlockManager} blocks
   * @property {import('../types').ISelectionManager} selection
   * @property {Map<string, import('../types').BlockPlugin>} plugins
   * @property {string} defaultBlockType
   * @property {import('../types').ICrossBlockSelection} crossBlockSelection
   * @property {import('../types').IEventBus} events
   * @property {import('../BlockOperations').BlockOperations} blockOps
   * @property {(() => boolean)} [uiActivePredicate]
   */

  /**
   * @param {HTMLElement} rootEl
   * @param {ClipboardConfig} config
   */
  constructor(rootEl, config) {
    const { blocks, selection, plugins, defaultBlockType, crossBlockSelection, events, blockOps, uiActivePredicate } = config
    this.#rootEl = rootEl
    this.#blocks = blocks
    this.#selection = selection
    this.#plugins = plugins
    this.#defaultBlockType = defaultBlockType
    this.#crossBlockSelection = crossBlockSelection
    this.#events = events
    this.#isUIActive = uiActivePredicate ?? null

    this.#blockOps = blockOps
    this.#router = new PasteRouter(plugins.values())
    this.#crossEditor = new CrossBlockEditor(
      rootEl, blocks, selection, crossBlockSelection, events, defaultBlockType,
    )

    this.#onCopy = (e) => this.#handleCopy(/** @type {ClipboardEvent} */ (e))
    this.#onCut = (e) => this.#handleCut(/** @type {ClipboardEvent} */ (e))
    this.#onPaste = (e) => this.#handlePaste(/** @type {ClipboardEvent} */ (e))
    this.#onKeyDown = (e) => this.#handleKeyDown(/** @type {KeyboardEvent} */ (e))

    rootEl.addEventListener('copy', this.#onCopy, true)
    rootEl.addEventListener('cut', this.#onCut, true)
    rootEl.addEventListener('paste', this.#onPaste, true)
    rootEl.addEventListener('keydown', this.#onKeyDown, true)
  }

  destroy() {
    this.#rootEl.removeEventListener('copy', this.#onCopy, true)
    this.#rootEl.removeEventListener('cut', this.#onCut, true)
    this.#rootEl.removeEventListener('paste', this.#onPaste, true)
    this.#rootEl.removeEventListener('keydown', this.#onKeyDown, true)
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
      this.#crossEditor.setCaretToRangeEnd(crossRange)
      this.#crossEditor.deleteContent(crossRange, () => this.#notifyChanged())
      return
    }

    if (!(e.ctrlKey || e.metaKey)) return

    if (e.code === 'KeyX') {
      copyRange(e, crossRange)
      this.#crossEditor.setCaretToRangeEnd(crossRange)
      this.#crossEditor.deleteContent(crossRange, () => this.#notifyChanged())
    } else if (e.code === 'KeyC') {
      copyRange(e, crossRange)
    }
  }

  // ── Copy ────────────────────────────────────────────────────────────────────

  /** @param {ClipboardEvent} e */
  #handleCopy(e) {
    const selectedBlocks = this.#blocks.getSelectedBlocks()
    if (selectedBlocks.length > 0) {
      e.preventDefault()
      const blocksData = selectedBlocks.map((b) => b.save())
      const html = selectedBlocks.map((b) => b.contentElement.innerHTML).join('\n')
      const text = selectedBlocks.map((b) => b.contentElement.textContent).join('\n')
      e.clipboardData?.setData('text/plain', text)
      e.clipboardData?.setData('text/html', html)
      e.clipboardData?.setData(MIME_TYPE, JSON.stringify(blocksData))
      return
    }

    const crossRange = this.#crossBlockSelection.range
    if (crossRange) {
      e.preventDefault()
      const { text, html } = extractRangeContent(crossRange)
      e.clipboardData?.setData('text/plain', text)
      e.clipboardData?.setData('text/html', html)
    }
  }

  // ── Cut ─────────────────────────────────────────────────────────────────────

  /** @param {ClipboardEvent} e */
  #handleCut(e) {
    this.#handleCopy(e)

    const blocks = this.#blocks

    if (this.#blocks.hasSelectedBlocks()) {
      const result = blocks.removeSelected(this.#defaultBlockType)
      if (result) {
        blocks.setCurrentIndex(result.focusIndex)
        const focusBlock = blocks.getBlockByIndex(result.focusIndex)
        if (focusBlock) {
          focusBlock.focus()
          this.#selection.setCaretToBlock(focusBlock.id, 'start')
        }
      }
      return
    }

    const crossRange = this.#crossBlockSelection.range
    if (crossRange) {
      this.#crossEditor.deleteContent(crossRange, () => this.#notifyChanged())
    }
  }

  // ── Paste ───────────────────────────────────────────────────────────────────

  /** @param {ClipboardEvent} e */
  #handlePaste(e) {
    const target = /** @type {HTMLElement | null} */ (e.target)
    if (target) {
      // Only handle paste inside content blocks.
      if (!target.closest(BLOCK_SELECTOR)) return
      const closestNonEditable = target.closest('[contenteditable="false"]')
      if (closestNonEditable && closestNonEditable.closest(BLOCK_SELECTOR)) return
    }

    e.preventDefault()
    this.#events.emit(EditorEvent.UNDO_BATCH_START)

    // Remove selected blocks and determine insert position
    const result = this.#blocks.removeSelected(this.#defaultBlockType)
    let insertIndex = result ? result.focusIndex : this.#blocks.getCurrentIndex() + 1
    const hadSelection = !!result

    // ── 1. Internal MIME (block-level paste) ──
    const customData = e.clipboardData?.getData(MIME_TYPE)
    if (customData) {
      this.#pasteCustomMime(customData, insertIndex)
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
      return
    }

    // ── 2. Files ──
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      this.#pasteFiles(files, insertIndex)
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
      return
    }

    // ── 3. Plain text URL/pattern matching (before HTML) ──
    const html = e.clipboardData?.getData('text/html')
    const plainText = e.clipboardData?.getData('text/plain') || ''

    if (plainText && this.#handlePatternPaste(plainText)) {
      this.#events.emit(EditorEvent.UNDO_BATCH_END)
      return
    }

    if (hadSelection) {
      this.#ensureCaretBlock(Math.min(insertIndex, this.#blocks.getBlockCount()))
    }

    // ── 4. HTML / plain text ──
    this.#pasteContent(html, plainText)

    this.#events.emit(EditorEvent.UNDO_BATCH_END)
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
      notifyChanged: () => this.#notifyChanged(),
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
      /** @type {Array<{type: string, data: Record<string, unknown>}>} */
      const blocksData = JSON.parse(customData)
      for (const blockData of blocksData) {
        const type = this.#plugins.has(blockData.type) ? blockData.type : this.#defaultBlockType
        this.#blocks.insert(type, blockData.data, insertIndex)
        insertIndex++
      }
      // Focus the last inserted block once (avoid intermediate focus shifts).
      const lastInserted = this.#blocks.getBlockByIndex(insertIndex - 1)
      if (lastInserted) {
        this.#blocks.setCurrentIndex(insertIndex - 1)
        this.#selection.setCaretToBlock(lastInserted.id, 'end')
        lastInserted.focus()
      }
    } catch (err) {
      console.error('[Clipboard] Failed to parse custom data:', err)
    }
  }

  /**
   * @param {FileList} files
   * @param {number} insertIndex
   */
  #pasteFiles(files, insertIndex) {
    const currentIndex = this.#blocks.getCurrentIndex()
    const currentBlock = this.#blocks.getBlockByIndex(currentIndex)
    let fileInsertIdx = insertIndex
    let replacedEmpty = false

    if (currentBlock?.isEmpty()
        && currentBlock.type === this.#defaultBlockType
        && files.length === 1) {
      fileInsertIdx = currentIndex
      replacedEmpty = true
    }

    for (const file of files) {
      if (this.#handleFilePaste(file, fileInsertIdx)) {
        if (replacedEmpty) {
          this.#blocks.remove(fileInsertIdx + 1)
          replacedEmpty = false
        }
        fileInsertIdx++
      }
    }

    // Refocus so Ctrl+Z works after pasting non-editable blocks (image, etc.).
    const lastInserted = this.#blocks.getBlockByIndex(fileInsertIdx - 1)
    if (lastInserted) {
      const focusTarget = lastInserted.contentElement || lastInserted.element
      if (focusTarget?.tabIndex !== undefined) {
        focusTarget.focus()
      } else {
        this.#rootEl.focus()
      }
    } else {
      this.#rootEl.focus()
    }
  }

  /**
   * @param {File} file
   * @param {number} insertIndex
   * @returns {boolean}
   */
  #handleFilePaste(file, insertIndex) {
    const plugin = this.#router.findByFile(file.type)
    if (!plugin?.onPaste) return false
    const data = plugin.onPaste({ type: 'file', file })
    if (!data) return false
    this.#blocks.insert(plugin.type, data, insertIndex)
    return true
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

  #notifyChanged() {
    const current = this.#blocks.getCurrentBlock()
    if (current) {
      this.#events.emit(EditorEvent.BLOCK_CHANGED, { blockId: current.id })
    }
    this.#events.emit(EditorEvent.CHANGED)
  }
}
