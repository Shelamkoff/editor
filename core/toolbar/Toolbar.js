import { el } from '../dom.js'
import { BlockSettingsMenu } from '../block-settings-menu/BlockSettingsMenu.js'
import { Tooltip } from '../Tooltip.js'
import { EditorEvent } from '../editorEvents.js'
import { DEFAULT_BLOCK_TYPE, OFFCANVAS_ANIMATION_MS } from '../constants.js'
import { ICON_PLUS, ICON_DRAG } from '../icons.js'
import { OffcanvasRoot } from './OffcanvasRoot.js'
import { ToolbarPositioner } from './ToolbarPositioner.js'
import { ToolboxBuilder } from './ToolboxBuilder.js'
import { isTextType } from '../crossBlockConvert.js'

/**
 * Block toolbar — the floating "+ / drag" buttons next to the focused block.
 *
 * Coordinates four collaborators:
 *  - `BlockSettingsMenu`     — drill-down for block-specific actions
 *  - `ToolboxBuilder`        — builds + manages the "+" plugin picker popup
 *  - `ToolbarPositioner`     — desktop/mobile placement + FLIP animation
 *  - `OffcanvasRoot`         — mobile offcanvas wrapper + backdrop
 *
 * The Toolbar itself owns the lifecycle, event subscriptions, public API
 * (`dragHandle`, `toggleSettingsMenu`, `closeToolbox`, `closeSettingsMenu`,
 * `destroy`), and the show/hide state of the toolbox.
 */
export class Toolbar {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {Document} */
  #document

  /** @type {(Window & typeof globalThis) | null} */
  #view

  /** Synthetic tests may omit ownerDocument entirely. */
  #ambientFallback = false

  /** @type {import('../types').IBlockManager} */
  #blocks

  /** @type {import('../types').ISelectionManager} */
  #selection

  /** @type {string} */
  #defaultBlockType

  /** @type {import('../BlockOperations').BlockOperations} */
  #blockOps

  /** @type {import('../types').IEventBus} */
  #events

  /** @type {Map<string, import('../types').BlockPlugin>} */
  #plugins

  /** @type {HTMLElement} */
  #toolbarEl

  /** @type {HTMLElement} */
  #toolboxEl

  /** @type {HTMLElement} */
  #plusBtn

  /** @type {HTMLElement} */
  #dragBtn

  /** @type {Tooltip} */
  #tooltip

  /** @type {BlockSettingsMenu} */
  #settingsMenu

  /** @type {ToolboxBuilder} */
  #toolboxBuilder

  /** @type {ToolbarPositioner} */
  #positioner

  /** @type {OffcanvasRoot} */
  #offcanvas

  /** @type {boolean} */
  #toolboxOpen = false

  /** @type {number} */
  #pendingRemovals = 0

  /** @type {ReturnType<typeof setTimeout> | null} */
  #toolboxReturnTimer = null

  /** @type {ReturnType<typeof setTimeout> | null} */
  #settingsReturnTimer = null

  /** @type {boolean} */
  #destroyed = false

  /** @type {(() => void) | null} */
  #unsubFocused = null
  /** @type {(() => void) | null} */
  #unsubMoved = null
  /** @type {(() => void) | null} */
  #unsubDragHandleClicked = null
  /** @type {(() => void) | null} */
  #unsubRemoved = null

  /**
   * @typedef {Object} ToolbarConfig
   * @property {Map<string, import('../types').BlockPlugin>} plugins
   * @property {import('../types').IBlockManager} blocks
   * @property {import('../types').ISelectionManager} selection
   * @property {import('../I18n').I18n} i18n
   * @property {import('../types').IEventBus} events
   * @property {import('../CommandDispatcher').CommandDispatcher} commands
   * @property {import('../types').ICrossBlockSelection} crossBlockSelection
   * @property {import('../BlockOperations').BlockOperations} blockOps
   * @property {string} [defaultBlockType]
   * @property {import('../InlinePluginRegistry').InlinePluginRegistry} [inlinePluginRegistry]
   * @property {(current: import('../types').IBlock, index: number) => import('../types').IBlock | undefined} duplicateBlock
   * @property {{ filterThreshold?: number, mobileBreakpoint?: number, moveAnimationMs?: number }} [tuning]
   */

  /**
   * @param {HTMLElement} rootEl
   * @param {ToolbarConfig} config
   */
  constructor(rootEl, config) {
    const {
      plugins, blocks, selection, i18n, events, commands, crossBlockSelection,
      blockOps, defaultBlockType, inlinePluginRegistry, duplicateBlock, tuning,
    } = config

    this.#rootEl = rootEl
    const ownerDocument = rootEl.ownerDocument ?? null
    this.#document = ownerDocument ?? globalThis.document
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (ownerDocument?.defaultView ?? null)
    this.#ambientFallback = !ownerDocument
    this.#blocks = blocks
    this.#selection = selection
    this.#defaultBlockType = defaultBlockType || DEFAULT_BLOCK_TYPE
    this.#blockOps = blockOps
    this.#events = events
    this.#plugins = plugins

    const filterThreshold = tuning?.filterThreshold ?? 7
    const mobileBreakpoint = tuning?.mobileBreakpoint ?? 768
    const moveAnimationMs = tuning?.moveAnimationMs ?? 200

    // ── DOM scaffold ─────────────────────────────────────────────────────────
    this.#toolbarEl = el('div', 'oe-toolbar', undefined, this.#document)
    this.#toolbarEl.style.display = 'none'

    this.#tooltip = new Tooltip(this.#document)

    this.#plusBtn = el('button', 'oe-toolbar__btn', {
      type: 'button',
      'aria-label': i18n.t('toolbar.add'),
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    }, this.#document)
    this.#plusBtn.innerHTML = ICON_PLUS
    this.#plusBtn.addEventListener('click', this.#onPlusClick)
    this.#plusBtn.addEventListener('mouseenter', () => this.#tooltip.show(this.#plusBtn, i18n.t('toolbar.add')))
    this.#plusBtn.addEventListener('mouseleave', () => this.#tooltip.hide())

    this.#dragBtn = el('button', 'oe-toolbar__btn oe-toolbar__drag', {
      type: 'button',
      'aria-label': i18n.t('toolbar.tune'),
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    }, this.#document)
    this.#dragBtn.innerHTML = ICON_DRAG
    this.#dragBtn.addEventListener('mouseenter', () => this.#tooltip.show(this.#dragBtn, i18n.t('toolbar.tune')))
    this.#dragBtn.addEventListener('mouseleave', () => this.#tooltip.hide())

    this.#toolbarEl.appendChild(this.#plusBtn)
    this.#toolbarEl.appendChild(this.#dragBtn)

    this.#toolboxEl = el('ul', 'oe-toolbox', { role: 'menu', tabindex: '-1' }, this.#document)
    this.#toolboxEl.style.display = 'none'

    // ── Collaborators ────────────────────────────────────────────────────────
    this.#offcanvas = new OffcanvasRoot(rootEl, () => {
      this.closeToolbox()
      this.closeSettingsMenu()
    })

    this.#positioner = new ToolbarPositioner(this.#toolbarEl, rootEl, blocks, {
      mobileBreakpoint,
      moveAnimationMs,
    })

    this.#toolboxBuilder = new ToolboxBuilder(this.#toolboxEl, {
      plugins,
      inlinePlugins: inlinePluginRegistry ?? null,
      i18n,
      filterThreshold,
      onInsertBlock: (type) => this.#insertBlock(type),
      onInsertInlinePlugin: (type) => this.#insertInlinePlugin(type),
      onClose: () => {
        this.closeToolbox()
        this.#plusBtn.focus()
      },
    })

    this.#settingsMenu = new BlockSettingsMenu(
      rootEl, blocks, selection, plugins, i18n, events,
      crossBlockSelection, blockOps, this.#defaultBlockType,
      duplicateBlock, commands, { mobileBreakpoint },
    )
    this.#settingsMenu.onClose = () => {
      if (this.#positioner.isMobile()) {
        this.#settingsMenu.menuEl.classList.remove('oe-settings-menu--open')
        this.#offcanvas.hideBackdrop()
        this.#dragBtn.setAttribute('aria-expanded', 'false')
        if (this.#settingsReturnTimer) this.#clearTimer(this.#settingsReturnTimer)
        this.#settingsReturnTimer = this.#setTimer(() => {
          this.#settingsReturnTimer = null
          if (!this.#destroyed && !this.#settingsMenu.isOpen) {
            this.#rootEl.appendChild(this.#settingsMenu.menuEl)
          }
        }, OFFCANVAS_ANIMATION_MS)
      }
    }

    rootEl.appendChild(this.#toolbarEl)
    rootEl.appendChild(this.#toolboxEl)

    // ── Event subscriptions ──────────────────────────────────────────────────
    this.#unsubFocused = events.on(EditorEvent.BLOCK_FOCUSED, () => {
      if (!this.#positioner.moveAnimating && this.#pendingRemovals === 0) {
        if (!this.#positioner.updatePosition()) this.hide()
      }
    })

    // DragManager announces a click on the drag handle via event bus —
    // decoupled so DragManager doesn't hold a Toolbar reference.
    this.#unsubDragHandleClicked = events.on(EditorEvent.DRAG_HANDLE_CLICKED, () => {
      this.toggleSettingsMenu()
    })

    // After block-removed animation finishes, FLIP the toolbar to its new spot.
    this.#unsubRemoved = events.on(
      EditorEvent.BLOCK_REMOVED,
      (/** @type {{ animDone?: Promise<void> }} */ payload) => {
        this.#pendingRemovals++
        const done = payload?.animDone ?? Promise.resolve()
        Promise.resolve(done).catch(() => undefined).then(() => {
          if (this.#destroyed) return
          this.#pendingRemovals = Math.max(0, this.#pendingRemovals - 1)
          if (this.#pendingRemovals === 0) this.#positioner.animateAfterRemoval()
        })
      },
    )

    // Animate alongside the moved block.
    this.#unsubMoved = events.on(EditorEvent.BLOCK_MOVED, () => {
      const menuEl = this.#settingsMenu.isOpen
        ? /** @type {HTMLElement | null} */ (this.#rootEl.querySelector('.oe-settings-menu'))
        : null
      this.#positioner.animatePosition(menuEl)
    })

    this.#document.addEventListener('click', this.#onDocumentClick, true)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Drag button element — DragManager attaches its mousedown listener here. */
  get dragHandle() {
    return this.#dragBtn
  }

  /**
   * Toggle the block settings menu (called via event from DragManager).
   */
  toggleSettingsMenu() {
    this.#tooltip.hide()
    this.closeToolbox()

    if (this.#positioner.isMobile()) {
      if (this.#settingsMenu.isOpen) {
        this.#settingsMenu.close()
      } else {
        this.#offcanvas.showBackdrop()
        this.#offcanvas.getRoot().appendChild(this.#settingsMenu.menuEl)
        this.#settingsMenu.toggle()
        this.#requestFrame(() => {
          if (!this.#destroyed && this.#settingsMenu.isOpen) {
            this.#settingsMenu.menuEl.classList.add('oe-settings-menu--open')
          }
        })
      }
    } else {
      this.#settingsMenu.toggle()
    }

    this.#dragBtn.setAttribute('aria-expanded', String(this.#settingsMenu.isOpen))
  }

  /** Show the toolbar next to the current block. */
  show() {
    this.#toolbarEl.style.display = ''
    if (!this.#positioner.updatePosition()) this.hide()
  }

  /** Hide the toolbar. */
  hide() {
    this.#toolbarEl.style.display = 'none'
    this.closeToolbox()
  }

  /** Open the "+" plugin picker. */
  openToolbox() {
    this.#tooltip.hide()
    this.#toolboxOpen = true
    this.#plusBtn.classList.add('oe-toolbar__btn--active')
    this.#plusBtn.setAttribute('aria-expanded', 'true')
    this.#events.emit(EditorEvent.TOOLBAR_OPENED, { type: 'block' })

    if (this.#positioner.isMobile()) {
      this.#offcanvas.showBackdrop()
      this.#offcanvas.getRoot().appendChild(this.#toolboxEl)
      this.#toolboxEl.style.display = ''
      this.#requestFrame(() => {
        if (!this.#destroyed && this.#toolboxOpen) {
          this.#toolboxEl.classList.add('oe-toolbox--open')
        }
      })
    } else {
      this.#toolboxEl.style.display = ''
      this.#positioner.positionToolbox(this.#toolboxEl)
    }

    this.#toolboxBuilder.resetFilter()

    if (this.#toolboxBuilder.filterInput) {
      this.#requestFrame(() => {
        if (this.#toolboxOpen) this.#toolboxBuilder.filterInput?.focus()
      })
    } else {
      this.#requestFrame(() => {
        if (this.#toolboxOpen) this.#toolboxEl.focus()
      })
    }
  }

  /** Close the "+" plugin picker. */
  closeToolbox() {
    if (!this.#toolboxOpen) return
    this.#toolboxOpen = false
    this.#plusBtn.classList.remove('oe-toolbar__btn--active')
    this.#plusBtn.setAttribute('aria-expanded', 'false')
    this.#events.emit(EditorEvent.TOOLBAR_CLOSED, { type: 'block' })

    if (this.#positioner.isMobile()) {
      this.#toolboxEl.classList.remove('oe-toolbox--open')
      this.#offcanvas.hideBackdrop()
      if (this.#toolboxReturnTimer) this.#clearTimer(this.#toolboxReturnTimer)
      this.#toolboxReturnTimer = this.#setTimer(() => {
        this.#toolboxReturnTimer = null
        if (!this.#destroyed && !this.#toolboxOpen) {
          this.#toolboxEl.style.display = 'none'
          this.#rootEl.appendChild(this.#toolboxEl)
        }
      }, OFFCANVAS_ANIMATION_MS)
    } else {
      this.#toolboxEl.style.display = 'none'
    }
  }

  /** Close the block settings menu. */
  closeSettingsMenu() {
    this.#settingsMenu.close()
    this.#dragBtn.setAttribute('aria-expanded', 'false')
  }

  destroy() {
    this.#destroyed = true
    if (this.#toolboxReturnTimer) {
      this.#clearTimer(this.#toolboxReturnTimer)
      this.#toolboxReturnTimer = null
    }
    if (this.#settingsReturnTimer) {
      this.#clearTimer(this.#settingsReturnTimer)
      this.#settingsReturnTimer = null
    }
    this.#unsubFocused?.()
    this.#unsubMoved?.()
    this.#unsubDragHandleClicked?.()
    this.#unsubRemoved?.()
    this.#document.removeEventListener('click', this.#onDocumentClick, true)
    this.#plusBtn.removeEventListener('click', this.#onPlusClick)
    this.#toolboxBuilder.destroy()
    this.#tooltip.destroy()
    this.#settingsMenu.destroy()
    this.#offcanvas.destroy()
    this.#toolbarEl.remove()
    this.#toolboxEl.remove()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [data]
   */
  #insertBlock(type, data) {
    this.#blockOps.replaceEmptyOrInsert(type, data)
    this.closeToolbox()
  }

  /**
   * Request inline plugin widget insertion via event bus.
   * EditorFacade owns the actual DOM insertion.
   *
   * Before emitting, restore focus + caret to the current block. The toolbox
   * `<ul>` was focused while it was open, so the live native selection points
   * inside the menu — without this, EditorFacade would insert the widget into
   * the menu item instead of the block.
   *
   * Inline plugins only make sense inside text blocks (paragraph, heading,
   * quote, …) — the widget is inline HTML that needs a contenteditable host.
   * If the currently focused block is NOT a text block, we insert a fresh
   * default-type block directly below it and target that instead, so the
   * `+` action always ends up with a usable caret position.
   *
   * @param {string} type
   */
  #insertInlinePlugin(type) {
    let block = this.#blocks.getCurrentBlock()

    const needsNewBlock = !block || !isTextType(this.#plugins, block.type)
    if (needsNewBlock) {
      const insertAt = block
        ? this.#blocks.getBlockIndex(block.id) + 1
        : this.#blocks.getBlockCount()
      const created = this.#blocks.insert(this.#defaultBlockType, {}, insertAt)
      if (created) {
        block = created
        this.#blocks.setCurrentIndex(this.#blocks.getBlockIndex(created.id))
      }
    }

    if (block) {
      block.focus()
      // `start` is the right position for a freshly-inserted paragraph
      // (empty block); for an existing text block, end-of-content is
      // where the user mentally expects their `+` action to land.
      this.#selection.setCaretToBlock(block.id, needsNewBlock ? 'start' : 'end')
    }
    this.#events.emit(EditorEvent.INLINE_PLUGIN_INSERT, { type })
    this.closeToolbox()
  }

  /** @param {ReturnType<typeof setTimeout>} timer */
  #clearTimer(timer) {
    const clearTimer = this.#view?.clearTimeout?.bind(this.#view)
      ?? (this.#ambientFallback ? clearTimeout : null)
    clearTimer?.(/** @type {number} */ (timer))
  }

  /** @param {() => void} callback @param {number} delay */
  #setTimer(callback, delay) {
    const setTimer = this.#view?.setTimeout?.bind(this.#view)
      ?? (this.#ambientFallback ? setTimeout : null)
    if (setTimer) return setTimer(callback, delay)
    queueMicrotask(callback)
    return null
  }

  /** @param {() => void} callback */
  #requestFrame(callback) {
    const requestFrame = this.#view?.requestAnimationFrame?.bind(this.#view)
      ?? (this.#ambientFallback ? requestAnimationFrame : null)
    if (requestFrame) requestFrame(callback)
    else queueMicrotask(callback)
  }

  #onPlusClick = (/** @type {MouseEvent} */ e) => {
    e.stopPropagation()
    this.#settingsMenu.close()
    if (this.#toolboxOpen) {
      this.closeToolbox()
    } else {
      this.openToolbox()
    }
  }

  #onDocumentClick = (/** @type {MouseEvent} */ e) => {
    if (!this.#toolboxOpen) return
    const target = e.target
    const NodeCtor = this.#view?.Node ?? (this.#ambientFallback ? globalThis.Node : null)
    if (NodeCtor ? !(target instanceof NodeCtor) : !target || typeof target !== 'object') return
    const targetNode = /** @type {import('../types').DOMNode} */ (target)
    if (this.#toolboxEl.contains(targetNode) || this.#plusBtn.contains(targetNode)) return
    // On mobile the backdrop handles closing.
    if (this.#positioner.isMobile()) return
    this.closeToolbox()
  }
}
