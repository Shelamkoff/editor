import { el } from '../dom.js'
import { CrossBlockSelection } from '../CrossBlockSelection.js'
import { handleMenuKeydown } from '../menuKeyboardNav.js'
import { restoreSelection } from '../splitConvert.js'
import { BlockActions } from './BlockActions.js'
import { MenuBuilder } from './MenuBuilder.js'
import { MenuPositioner } from './MenuPositioner.js'

/**
 * The drill-down menu shown next to a block: move/duplicate/convert/delete
 * plus any plugin-specific settings (heading levels, table operations, etc.).
 *
 * Coordinates three collaborators:
 *  - `MenuBuilder`     — DOM construction (main view + convert view + items)
 *  - `BlockActions`    — block-mutating operations
 *  - `MenuPositioner`  — desktop/mobile placement
 *
 * The menu itself owns lifecycle (open/close/destroy), the saved selection
 * range, and the keyboard navigation handler. The native selection range
 * gets snapshotted on open and restored on close so the user's caret
 * survives the menu's focus shift.
 */
export class BlockSettingsMenu {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('../types').ICrossBlockSelection} */
  #crossBlockSelection

  /** @type {HTMLElement} */
  #menuEl

  /** @type {boolean} */
  #open = false

  /** @type {(() => void) | null} */
  #onCloseCallback = null

  /** @type {Range | null} */
  #savedRange = null

  /** @type {MenuBuilder} */
  #builder

  /** @type {BlockActions} */
  #actions

  /** @type {MenuPositioner} */
  #positioner

  /**
   * @param {HTMLElement} rootEl
   * @param {import('../types').IBlockManager} blocks
   * @param {import('../types').ISelectionManager} selection
   * @param {Map<string, import('../types').BlockPlugin>} plugins
   * @param {import('../I18n').I18n} i18n
   * @param {import('../types').IEventBus} events
   * @param {import('../types').ICrossBlockSelection} crossBlockSelection
   * @param {import('../BlockOperations').BlockOperations} blockOps
   * @param {string} defaultBlockType
   * @param {(current: import('../types').IBlock, index: number) => import('../types').IBlock | undefined} duplicateBlock
   * @param {import('../CommandDispatcher').CommandDispatcher} commands
   * @param {{ mobileBreakpoint?: number }} [tuning]
   */
  constructor(rootEl, blocks, selection, plugins, i18n, events, crossBlockSelection, blockOps, defaultBlockType, duplicateBlock, commands, tuning) {
    this.#rootEl = rootEl
    this.#crossBlockSelection = crossBlockSelection

    this.#menuEl = el('ul', 'oe-settings-menu', { role: 'menu', tabindex: '-1' })
    this.#menuEl.style.display = 'none'
    this.#menuEl.addEventListener('keydown', this.#onMenuKeydown)
    // Prevent mousedown from propagating to the editor root — otherwise the
    // editor's onMouseDown handler clears the cross-block selection.
    this.#menuEl.addEventListener('mousedown', (e) => e.stopPropagation())
    rootEl.appendChild(this.#menuEl)

    document.addEventListener('click', this.#onDocumentClick, true)

    this.#actions = new BlockActions({
      blocks, selection, blockOps, plugins, crossBlockSelection, events, commands,
      defaultBlockType, duplicateBlock,
      // Every terminal action positions focus/caret itself. Restoring the
      // range captured before the menu opened would either move focus back to
      // the source block (duplicate) or target detached DOM (delete/convert).
      onClose: () => this.close({ restoreSelection: false }),
      onAfterMove: () => this.#refreshAfterMove(),
      getSavedRange: () => this.#savedRange,
    })

    this.#builder = new MenuBuilder(this.#menuEl, {
      blocks, plugins, i18n,
      actions: this.#actions,
      rebuildMain: (direction) => this.#builder.buildMainView(direction),
    })

    this.#positioner = new MenuPositioner(this.#menuEl, rootEl, tuning?.mobileBreakpoint ?? 768)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** @returns {boolean} */
  get isOpen() {
    return this.#open
  }

  /** @returns {HTMLElement} */
  get menuEl() {
    return this.#menuEl
  }

  /** @param {() => void} cb */
  set onClose(cb) {
    this.#onCloseCallback = cb
  }

  toggle() {
    if (this.#open) this.close()
    else this.#show()
  }

  /** @param {{ restoreSelection?: boolean }} [options] */
  close(options = {}) {
    if (!this.#open) return
    const restore = options.restoreSelection ?? true
    this.#open = false
    this.#menuEl.style.display = 'none'
    CrossBlockSelection.hideHighlight()
    if (restore) this.#restoreSelection()
    this.#savedRange = null
    this.#onCloseCallback?.()
  }

  destroy() {
    document.removeEventListener('click', this.#onDocumentClick, true)
    this.#menuEl.removeEventListener('keydown', this.#onMenuKeydown)
    this.#menuEl.remove()
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  #show() {
    this.#open = true

    // Snapshot the live selection so we can restore it after the menu closes.
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      this.#savedRange = sel.getRangeAt(0).cloneRange()
    }
    if (this.#crossBlockSelection.range) {
      this.#savedRange = this.#crossBlockSelection.clone()
    }

    // Use the CSS Highlight API so the selection stays visible while focus
    // is in the menu (otherwise contenteditable loses its visual highlight).
    if (this.#savedRange && !this.#savedRange.collapsed) {
      CrossBlockSelection.showHighlight(this.#savedRange)
    }

    this.#builder.buildMainView()
    this.#menuEl.style.display = ''
    this.#positioner.position()

    // Focus the menu container for keyboard nav, but not individual items
    // (avoids a focus-visible highlight when opened by mouse click).
    requestAnimationFrame(() => {
      if (this.#open) this.#menuEl.focus()
    })
  }

  /** Rebuild items + reposition after a move (keep menu open). */
  #refreshAfterMove() {
    this.#builder.buildMainView('none')
    this.#positioner.position()
  }

  #restoreSelection() {
    restoreSelection(this.#savedRange, this.#crossBlockSelection)
  }

  /** @param {KeyboardEvent} e */
  #onMenuKeydown = (e) => {
    handleMenuKeydown(e, this.#menuEl, {
      onEscape: () => this.close(),
    })
  }

  #onDocumentClick = (/** @type {MouseEvent} */ e) => {
    if (!this.#open) return
    const target = e.target
    if (!(target instanceof globalThis.Node)) return
    const targetNode = /** @type {import('../types').DOMNode} */ (target)
    if (this.#menuEl.contains(targetNode)) return

    // Ignore clicks on the toolbar (drag handle has its own toggle path).
    const toolbar = this.#rootEl.querySelector('.oe-toolbar')
    if (toolbar?.contains(targetNode)) return

    // On mobile the backdrop handles closing via Toolbar.
    const backdrop = this.#rootEl.closest('.oe-editor')?.parentElement?.querySelector('.oe-offcanvas-backdrop')
      ?? document.querySelector('.oe-offcanvas-backdrop')
    if (backdrop?.contains(targetNode)) return

    this.close()
  }
}
