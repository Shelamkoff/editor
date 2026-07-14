import { el } from '../dom.js'
import { Tooltip } from '../Tooltip.js'
import { EditorEvent } from '../editorEvents.js'
import { ActionsPanel } from './ActionsPanel.js'
import { InlinePositioner } from './InlinePositioner.js'
import { PluginControlsSlot } from './PluginControlsSlot.js'
import { SelectionTracker } from './SelectionTracker.js'

const VIEW_BUTTONS = 'buttons'
const VIEW_ACTIONS = 'actions'

/**
 * Format a keyboard shortcut for display in tooltips.
 * @param {string} combo
 * @returns {string}
 */
function formatShortcut(combo) {
  if (!combo) return ''
  // noinspection JSDeprecatedSymbols — navigator.platform is needed as a fallback for older browsers.
  const isMac = typeof navigator !== 'undefined'
    && /Mac|iPhone|iPad/.test(navigator.userAgent || navigator.platform || '')
  const parts = combo.split('+')
  const formatted = parts.map((p) => {
    if (p === 'Mod') return isMac ? '⌘' : 'Ctrl'
    if (p === 'Shift') return isMac ? '⇧' : 'Shift'
    if (p === 'Alt') return isMac ? '⌥' : 'Alt'
    return p
  })
  return isMac ? formatted.join('') : formatted.join('+')
}

/**
 * Floating toolbar that appears above non-collapsed text selections.
 *
 * Coordinates four collaborators:
 *  - `SelectionTracker`     — when to show/hide based on the user's selection
 *  - `InlinePositioner`     — where to render relative to the selection rect
 *  - `PluginControlsSlot`   — plugin-provided buttons (e.g. heading level)
 *  - `ActionsPanel`         — drill-down panels for tools that need a UI
 *                             (link editor, font size, etc.)
 *
 * The Toolbar itself owns the lifecycle, the buttons panel build, and the
 * public API (`show`, `hide`, `openTool`, `destroy`).
 */
export class InlineToolbar {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('../types').ISelectionManager} */
  #selection

  /** @type {import('../types').IBlockManager} */
  #blocks

  /** @type {import('../types').IEventBus} */
  #events

  /** @type {import('../types').InlineTool[]} */
  #tools

  /** @type {import('../types').ICrossBlockSelection} */
  #crossBlockSelection

  /** @type {HTMLElement} */
  #el

  /** @type {HTMLElement} */
  #buttonsPanel

  /** @type {Map<string, HTMLElement>} */
  #buttons = new Map()

  /** @type {boolean} */
  #visible = false

  /** @type {'buttons' | 'actions'} */
  #currentView = VIEW_BUTTONS

  /** @type {Tooltip} */
  #tooltip

  /** @type {import('../TypeSelector').TypeSelector} */
  #typeSelector

  /** @type {ActionsPanel} */
  #actionsPanel

  /** @type {InlinePositioner} */
  #positioner

  /** @type {PluginControlsSlot} */
  #pluginControls

  /** @type {SelectionTracker} */
  #selectionTracker

  /** @type {import('../CommandDispatcher').CommandDispatcher} */
  #mutations

  /** @type {import('../types').InlineMutationContext} */
  #mutationContext

  /**
   * @param {HTMLElement} rootEl
   * @param {import('../types').ISelectionManager} selection
   * @param {import('../types').IBlockManager} blocks
   * @param {import('../types').IEventBus} events
   * @param {import('../types').InlineTool[]} tools
   * @param {(type: string) => import('../types').BlockPlugin['renderInlineControls'] | undefined} getInlineControls
   * @param {import('../TypeSelector').TypeSelector} typeSelector
   * @param {import('../types').ICrossBlockSelection} crossBlockSelection
   * @param {import('../CommandDispatcher').CommandDispatcher} commands
   */
  constructor(rootEl, selection, blocks, events, tools, getInlineControls, typeSelector, crossBlockSelection, commands) {
    this.#rootEl = rootEl
    this.#selection = selection
    this.#blocks = blocks
    this.#events = events
    this.#tools = tools
    this.#crossBlockSelection = crossBlockSelection
    this.#typeSelector = typeSelector
    this.#tooltip = new Tooltip()
    this.#mutations = commands
    this.#mutationContext = {
      mutate: (range, operation) => this.#mutations.runForRange(range, operation),
    }

    // ── DOM scaffold ─────────────────────────────────────────────────────────
    this.#el = el('div', 'oe-inline-toolbar')
    this.#el.style.display = 'none'

    this.#buttonsPanel = el('div', 'oe-inline-toolbar__panel')

    // Type selector is injected (constructed in createEditor with the full
    // plugin map; InlineToolbar deliberately doesn't depend on that).
    this.#typeSelector.onConvert = () => {
      this.#typeSelector.update()
      this.hide()
    }
    this.#buttonsPanel.appendChild(this.#typeSelector.selectButton)

    // Divider after type selector.
    this.#buttonsPanel.appendChild(el('div', 'oe-inline-toolbar__divider'))

    // Plugin controls zone (filled by the focused block's plugin, if any).
    const pluginZone = el('div', 'oe-inline-toolbar__plugin-zone')
    const pluginDivider = el('div', 'oe-inline-toolbar__divider')
    pluginDivider.style.display = 'none'
    this.#buttonsPanel.appendChild(pluginZone)
    this.#buttonsPanel.appendChild(pluginDivider)

    // Tool buttons.
    this.#buildToolButtons()

    this.#el.appendChild(this.#buttonsPanel)
    this.#el.appendChild(this.#typeSelector.dropdownElement)
    rootEl.appendChild(this.#el)

    // ── Collaborators ────────────────────────────────────────────────────────
    this.#positioner = new InlinePositioner(this.#el, rootEl)

    this.#actionsPanel = new ActionsPanel({
      events,
      crossBlockSelection,
      tooltip: this.#tooltip,
      updateActiveStates: () => this.#updateActiveStates(),
      hideTypeSelector: () => this.#typeSelector.close(),
      mutate: (range, operation) => this.#mutations.runForRange(range, operation),
      // After the drill-down panel closes, restore the buttons view so the
      // toolbar visually reappears (otherwise it stays stuck in actions mode
      // with nothing inside, which looks like the toolbar disappeared).
      onClosed: () => {
        this.#currentView = VIEW_BUTTONS
        this.#buttonsPanel.style.display = ''
      },
    })

    this.#pluginControls = new PluginControlsSlot(pluginZone, pluginDivider, {
      blocks,
      getInlineControls,
      events,
      typeSelector: this.#typeSelector,
      setSuppressSelectionChange: (value) => this.#selectionTracker.setSuppressSelectionChange(value),
      mutations: this.#mutations,
    })

    this.#selectionTracker = new SelectionTracker(this.#el, {
      rootEl,
      blocks,
      crossBlockSelection,
      show: () => this.show(),
      hide: () => this.hide(),
      updateActiveStates: () => this.#updateActiveStates(),
      isInActionsView: () => this.#currentView === VIEW_ACTIONS,
      isTypeSelectorOpen: () => this.#typeSelector.isOpen,
      hasOpenToolDropdown: () => this.#hasOpenToolDropdown(),
    })

    // Notify tools after DOM is fully assembled.
    for (const tool of this.#tools) {
      const btn = this.#buttons.get(tool.type)
      if (tool.onMount && btn) tool.onMount(btn, this.#mutationContext)
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** @returns {boolean} */
  // noinspection JSUnusedGlobalSymbols
  get isVisible() {
    return this.#visible
  }

  show() {
    this.#visible = true
    this.#currentView = VIEW_BUTTONS
    this.#buttonsPanel.style.display = ''
    this.#actionsPanel.reset()
    this.#typeSelector.close()
    this.#tooltip.hide()
    this.#typeSelector.update()
    this.#pluginControls.update()
    this.#el.style.display = ''
    this.#updateActiveStates()
    this.#positioner.position()
    this.#events.emit(EditorEvent.TOOLBAR_OPENED, { type: 'inline' })
  }

  hide() {
    if (!this.#visible) return
    // Don't hide while a cross-block selection is active.
    if (this.#crossBlockSelection.range) return
    this.#visible = false
    this.#currentView = VIEW_BUTTONS
    this.#el.style.display = 'none'
    this.#buttonsPanel.style.display = ''
    this.#actionsPanel.reset()
    this.#typeSelector.close()
    this.#pluginControls.clear()
    this.#tooltip.hide()
    this.#events.emit(EditorEvent.TOOLBAR_CLOSED, { type: 'inline' })
  }

  /**
   * Programmatically open a tool by name (e.g. from a keyboard shortcut).
   * @param {string} toolName
   */
  openTool(toolName) {
    const sel = this.#resolveSelection()
    if (!sel) return

    if (sel.blockId) {
      const block = this.#blocks.getBlockById(sel.blockId)
      if (!block?.hasInlineTools) return
    }

    const allowedTypes = this.#resolveAllowedToolTypes(sel)
    if (allowedTypes && !allowedTypes.has(toolName)) return

    const tool = this.#tools.find((t) => t.type === toolName)
    if (!tool) return

    if (!this.#visible) this.show()

    if (tool.renderActions) {
      this.#openActions(tool)
    } else {
      this.#mutations.runForRange(sel.range, () => tool.toggle(sel))
      this.#updateActiveStates()
    }
  }

  /**
   * Returns true when the inline toolbar has an interactive UI open
   * (actions panel or a tool dropdown like font-size).
   * Used by KeyboardManager to yield control to the overlay.
   * @returns {boolean}
   */
  hasActiveUI() {
    return this.#currentView === VIEW_ACTIONS || this.#hasOpenToolDropdown()
  }

  destroy() {
    this.#selectionTracker.destroy()
    this.#pluginControls.clear()

    for (const tool of this.#tools) {
      tool.destroy?.()
    }

    this.#typeSelector.destroy()
    this.#tooltip.destroy()
    this.#el.remove()
  }

  // ── Tool button construction ───────────────────────────────────────────────

  #buildToolButtons() {
    for (const tool of this.#tools) {
      const btn = el('button', 'oe-inline-tool', {
        type: 'button',
        'data-tool': tool.type,
      })
      btn.innerHTML = tool.icon

      btn.addEventListener('mouseenter', () => {
        const active = btn.classList.contains('oe-inline-tool--active')
        const label = tool.getTitle?.(active) ?? tool.title ?? tool.type
        const shortcut = tool.shortcut ? formatShortcut(tool.shortcut) : undefined
        this.#tooltip.show(btn, label, shortcut)
      })
      btn.addEventListener('mouseleave', () => this.#tooltip.hide())

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })

      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.#tooltip.hide()

        // Close any open dropdowns first.
        this.#typeSelector.close()

        const sel = this.#resolveSelection()
        const allowedTypes = sel ? this.#resolveAllowedToolTypes(sel) : null
        if (allowedTypes && !allowedTypes.has(tool.type)) return
        if (tool.renderActions) {
          this.#openActions(tool)
        } else {
          // Clear any block-selection overlay (Ctrl+A) to prevent double-highlight.
          this.#blocks.clearSelection()
          if (sel) this.#mutations.runForRange(sel.range, () => tool.toggle(sel))
          this.#updateActiveStates()
        }
      })

      this.#buttonsPanel.appendChild(btn)
      this.#buttons.set(tool.type, btn)
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Open a tool's actions panel (drill-down view) — or fall back to toggle
   * semantics if the tool returns null from `renderActions`.
   *
   * @param {import('../types').InlineTool} tool
   */
  #openActions(tool) {
    const panel = this.#actionsPanel.open(tool)
    if (!panel) {
      // The tool wants toggle semantics rather than a panel.
      const sel = this.#selection.getSelection() ?? this.#resolveSelection()
      if (sel) {
        this.#mutations.runForRange(sel.range, () => tool.toggle(sel))
        this.#updateActiveStates()
      }
      return
    }

    this.#currentView = VIEW_ACTIONS
    this.#buttonsPanel.style.display = 'none'
    this.#el.appendChild(panel)
  }

  /** @returns {import('../types').InlineSelection | null} */
  #resolveSelection() {
    const crossRange = this.#crossBlockSelection.range
    if (crossRange) {
      return { range: crossRange, text: crossRange.toString(), blockId: '' }
    }
    const sel = this.#selection.getSelection()
    if (sel) return sel
    const nativeSel = window.getSelection()
    if (nativeSel && !nativeSel.isCollapsed && nativeSel.rangeCount > 0) {
      return { range: nativeSel.getRangeAt(0), text: nativeSel.toString(), blockId: '' }
    }
    return null
  }

  #updateActiveStates() {
    const selection = this.#resolveSelection()
    const allowedTypes = selection ? this.#resolveAllowedToolTypes(selection) : null

    for (const tool of this.#tools) {
      const btn = this.#buttons.get(tool.type)
      if (!btn) continue

      const allowed = !allowedTypes || allowedTypes.has(tool.type)
      btn.hidden = !allowed
      if (!allowed) {
        btn.classList.remove('oe-inline-tool--active')
        continue
      }

      let active = false
      if (selection && tool.isActive) {
        active = tool.isActive(selection)
      }
      btn.classList.toggle('oe-inline-tool--active', active)

      // Update dynamic icon if the tool provides one (e.g. alignment, link toggle).
      if (tool.getIcon) {
        btn.innerHTML = tool.getIcon(active)
      }
    }
  }

  /**
   * Intersect per-block tool allowlists across the selected range.
   * null means every editor-configured tool is allowed.
   * @param {import('../types').InlineSelection} selection
   * @returns {Set<string> | null}
   */
  #resolveAllowedToolTypes(selection) {
    const startBlock = selection.blockId
      ? this.#blocks.getBlockById(selection.blockId)
      : this.#blocks.getBlockByChildNode(selection.range.startContainer)
    const endBlock = this.#blocks.getBlockByChildNode(selection.range.endContainer) ?? startBlock
    if (!startBlock) return null

    const startIndex = this.#blocks.getBlockIndex(startBlock.id)
    const endIndex = endBlock ? this.#blocks.getBlockIndex(endBlock.id) : startIndex
    if (startIndex < 0 || endIndex < 0) return null
    const from = Math.min(startIndex, endIndex)
    const to = Math.max(startIndex, endIndex)
    /** @type {Set<string> | null} */
    let allowed = null

    for (let index = from; index <= to; index++) {
      const block = this.#blocks.getBlockByIndex(index)
      const blockTypes = block?.inlineToolTypes
      if (!blockTypes) continue

      const blockSet = new Set(blockTypes)
      if (allowed === null) {
        allowed = blockSet
      } else {
        for (const type of allowed) {
          if (!blockSet.has(type)) allowed.delete(type)
        }
      }
    }

    return allowed
  }

  /** @returns {boolean} true if any tool has an open dropdown */
  #hasOpenToolDropdown() {
    return this.#tools.some((t) => t.isDropdownOpen?.())
  }
}
