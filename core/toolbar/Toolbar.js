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

  /** @type {boolean} */
  #removing = false

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
   * @property {import('../types').ICrossBlockSelection} crossBlockSelection
   * @property {import('../BlockOperations').BlockOperations} blockOps
   * @property {string} [defaultBlockType]
   * @property {import('../InlinePluginRegistry').InlinePluginRegistry} [inlinePluginRegistry]
   * @property {{ filterThreshold?: number, mobileBreakpoint?: number, moveAnimationMs?: number }} [tuning]
   */

  /**
   * @param {HTMLElement} rootEl
   * @param {ToolbarConfig} config
   */
  constructor(rootEl, config) {
    const {
      plugins, blocks, selection, i18n, events, crossBlockSelection,
      blockOps, defaultBlockType, inlinePluginRegistry, tuning,
    } = config

    this.#rootEl = rootEl
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
    this.#toolbarEl = el('div', 'oe-toolbar')
    this.#toolbarEl.style.display = 'none'

    this.#tooltip = new Tooltip()

    this.#plusBtn = el('button', 'oe-toolbar__btn', {
      type: 'button',
      'aria-label': i18n.t('toolbar.add'),
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    })
    this.#plusBtn.innerHTML = ICON_PLUS
    this.#plusBtn.addEventListener('click', this.#onPlusClick)
    this.#plusBtn.addEventListener('mouseenter', () => this.#tooltip.show(this.#plusBtn, i18n.t('toolbar.add')))
    this.#plusBtn.addEventListener('mouseleave', () => this.#tooltip.hide())

    this.#dragBtn = el('button', 'oe-toolbar__btn oe-toolbar__drag', {
      type: 'button',
      'aria-label': i18n.t('toolbar.tune'),
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    })
    this.#dragBtn.innerHTML = ICON_DRAG
    this.#dragBtn.addEventListener('mouseenter', () => this.#tooltip.show(this.#dragBtn, i18n.t('toolbar.tune')))
    this.#dragBtn.addEventListener('mouseleave', () => this.#tooltip.hide())

    this.#toolbarEl.appendChild(this.#plusBtn)
    this.#toolbarEl.appendChild(this.#dragBtn)

    this.#toolboxEl = el('ul', 'oe-toolbox', { role: 'menu', tabindex: '-1' })
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

    this.#settingsMenu = new BlockSettingsMenu(rootEl, blocks, selection, plugins, i18n, events, crossBlockSelection, blockOps, this.#defaultBlockType)
    this.#settingsMenu.onClose = () => {
      if (this.#positioner.isMobile()) {
        this.#settingsMenu.menuEl.classList.remove('oe-settings-menu--open')
        this.#offcanvas.hideBackdrop()
        this.#dragBtn.setAttribute('aria-expanded', 'false')
        setTimeout(() => {
          if (!this.#settingsMenu.isOpen) {
            this.#rootEl.appendChild(this.#settingsMenu.menuEl)
          }
        }, OFFCANVAS_ANIMATION_MS)
      }
    }

    rootEl.appendChild(this.#toolbarEl)
    rootEl.appendChild(this.#toolboxEl)

    // ── Event subscriptions ──────────────────────────────────────────────────
    this.#unsubFocused = events.on(EditorEvent.BLOCK_FOCUSED, () => {
      if (!this.#positioner.moveAnimating && !this.#removing) {
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
        this.#removing = true
        const done = payload?.animDone ?? Promise.resolve()
        done.then(() => {
          this.#removing = false
          this.#positioner.animateAfterRemoval()
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

    document.addEventListener('click', this.#onDocumentClick, true)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Drag button element — DragManager attaches its mousedown listener here. */
  get dragHandle() {
    return this.#dragBtn
  }

  /** @returns {boolean} */
  get isToolboxOpen() {
    return this.#toolboxOpen
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
        requestAnimationFrame(() => this.#settingsMenu.menuEl.classList.add('oe-settings-menu--open'))
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
      requestAnimationFrame(() => this.#toolboxEl.classList.add('oe-toolbox--open'))
    } else {
      this.#toolboxEl.style.display = ''
      this.#positioner.positionToolbox(this.#toolboxEl)
    }

    this.#toolboxBuilder.resetFilter()

    if (this.#toolboxBuilder.filterInput) {
      requestAnimationFrame(() => {
        if (this.#toolboxOpen) this.#toolboxBuilder.filterInput?.focus()
      })
    } else {
      requestAnimationFrame(() => {
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
      setTimeout(() => {
        if (!this.#toolboxOpen) {
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
    this.#unsubFocused?.()
    this.#unsubMoved?.()
    this.#unsubDragHandleClicked?.()
    this.#unsubRemoved?.()
    document.removeEventListener('click', this.#onDocumentClick, true)
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
    const target = /** @type {Node} */ (e.target)
    if (this.#toolboxEl.contains(target) || this.#plusBtn.contains(target)) return
    // On mobile the backdrop handles closing.
    if (this.#positioner.isMobile()) return
    this.closeToolbox()
  }
}
