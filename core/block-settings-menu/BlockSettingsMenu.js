import { el } from '../dom.js'
import { CrossBlockSelection } from '../CrossBlockSelection.js'
import { handleMenuKeydown } from '../menuKeyboardNav.js'
import { restoreSelection } from '../splitConvert.js'
import { BlockActions } from './BlockActions.js'
import { MenuBuilder } from './MenuBuilder.js'
import { MenuPositioner } from './MenuPositioner.js'

/** The drill-down menu shown next to a block. */
export class BlockSettingsMenu {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {Document} */
  #document

  /** @type {(Window & typeof globalThis) | null} */
  #view

  /** @type {import('../types').ICrossBlockSelection} */
  #crossBlockSelection

  /** @type {HTMLElement} */
  #menuEl

  /** @type {boolean} */
  #open = false

  #destroyed = false
  #generation = 0
  /** @type {import('../types').IBlockManager} */
  #blocks
  /** @type {import('../types').IBlock | null} */
  #source = null
  /** @type {HTMLElement | null} */
  #sourceContent = null

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
    this.#blocks = blocks
    this.#rootEl = rootEl
    this.#document = rootEl.ownerDocument
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (this.#document.defaultView)
    this.#crossBlockSelection = crossBlockSelection

    this.#menuEl = el('ul', 'oe-settings-menu', { role: 'menu', tabindex: '-1' }, this.#document)
    this.#menuEl.style.display = 'none'
    this.#menuEl.addEventListener('keydown', this.#onMenuKeydown)
    this.#menuEl.addEventListener('mousedown', (e) => e.stopPropagation())
    rootEl.appendChild(this.#menuEl)

    this.#document.addEventListener('click', this.#onDocumentClick, true)

    this.#actions = new BlockActions({
      blocks, selection, blockOps, plugins, crossBlockSelection, events, commands,
      defaultBlockType, duplicateBlock,
      onClose: () => this.close({ restoreSelection: false }),
      onAfterMove: () => this.#refreshAfterMove(),
      getSavedRange: () => this.#savedRange,
    })

    this.#builder = new MenuBuilder(this.#menuEl, {
      blocks, plugins, i18n,
      actions: this.#actions,
      isActive: () => this.#isActive(),
      rebuildMain: (direction) => this.#builder.buildMainView(direction),
    })

    this.#positioner = new MenuPositioner(this.#menuEl, rootEl, tuning?.mobileBreakpoint ?? 768)
  }

  /** @returns {boolean} */
  get isOpen() { return this.#open }

  /** @returns {HTMLElement} */
  get menuEl() { return this.#menuEl }

  /** @param {() => void} cb */
  set onClose(cb) { this.#onCloseCallback = cb }

  toggle() {
    if (this.#destroyed) return
    if (this.#open) this.close()
    else this.#show()
  }

  /** @param {{ restoreSelection?: boolean }} [options] */
  close(options = {}) {
    if (!this.#open) return
    const restore = options.restoreSelection ?? true
    const range = this.#savedRange
    this.#open = false
    this.#generation++
    this.#savedRange = null
    this.#source = null
    this.#sourceContent = null
    this.#builder.retire()
    this.#menuEl.style.display = 'none'
    if (range) CrossBlockSelection.hideHighlight(range)
    if (restore) restoreSelection(range, this.#crossBlockSelection)
    this.#onCloseCallback?.()
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    // Teardown must not restore focus or invoke the toolbar's return animation.
    this.#onCloseCallback = null
    this.close({ restoreSelection: false })
    this.#document.removeEventListener('click', this.#onDocumentClick, true)
    this.#menuEl.removeEventListener('keydown', this.#onMenuKeydown)
    this.#menuEl.remove()
  }

  #show() {
    if (this.#destroyed) return
    const generation = ++this.#generation
    this.#source = this.#blocks.getCurrentBlock() ?? null
    this.#sourceContent = this.#source?.contentElement ?? null
    this.#open = true

    const sel = this.#view?.getSelection()
    if (sel && sel.rangeCount > 0) {
      this.#savedRange = sel.getRangeAt(0).cloneRange()
    }
    if (this.#crossBlockSelection.range) {
      this.#savedRange = this.#crossBlockSelection.clone()
    }

    if (this.#savedRange && !this.#savedRange.collapsed) {
      CrossBlockSelection.showHighlight(this.#savedRange)
    }

    this.#builder.buildMainView()
    if (generation !== this.#generation || !this.#isActive()) return
    this.#menuEl.style.display = ''
    this.#positioner.position()

    const schedule = this.#view?.requestAnimationFrame?.bind(this.#view)
      ?? requestAnimationFrame
    schedule(() => {
      if (generation === this.#generation && this.#isActive()) this.#menuEl.focus()
    })
  }

  #refreshAfterMove() {
    if (!this.#isActive()) return
    this.#builder.buildMainView('none')
    this.#positioner.position()
  }

  #isActive() {
    if (this.#destroyed || !this.#open) return false
    const current = this.#blocks.getCurrentBlock() ?? null
    if (current !== this.#source || (current && (
      this.#blocks.getBlockById(current.id) !== current
      || current.contentElement !== this.#sourceContent
    ))) {
      this.close({ restoreSelection: false })
      return false
    }
    return true
  }

  /** @param {KeyboardEvent} e */
  #onMenuKeydown = (e) => {
    if (!this.#isActive()) return
    handleMenuKeydown(e, this.#menuEl, { onEscape: () => this.close() })
  }

  #onDocumentClick = (/** @type {MouseEvent} */ e) => {
    if (!this.#open) return
    const target = e.target
    if (!target || typeof target !== 'object' || !('nodeType' in target)) return
    const targetNode = /** @type {import('../types').DOMNode} */ (target)
    if (this.#menuEl.contains(targetNode)) return

    const toolbar = this.#rootEl.querySelector('.oe-toolbar')
    if (toolbar?.contains(targetNode)) return

    const backdrop = this.#rootEl.closest('.oe-editor')?.parentElement?.querySelector('.oe-offcanvas-backdrop')
      ?? this.#document.querySelector('.oe-offcanvas-backdrop')
    if (backdrop?.contains(targetNode)) return

    this.close()
  }
}
