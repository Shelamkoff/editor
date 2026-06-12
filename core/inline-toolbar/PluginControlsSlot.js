import { EditorEvent } from '../editorEvents.js'

/**
 * @typedef {Object} PluginControlsSlotDeps
 * @property {import('../types').IBlockManager} blocks
 * @property {(type: string) => import('../types').BlockPlugin['renderInlineControls'] | undefined} getInlineControls
 * @property {import('../types').IEventBus} events
 * @property {import('../TypeSelector').TypeSelector} typeSelector
 * @property {(suppress: boolean) => void} setSuppressSelectionChange
 *   Hint to the SelectionTracker to skip the next few selectionchange events
 *   (used while a plugin control swaps the contenteditable element).
 */

/**
 * The "plugin controls" zone in the inline toolbar — the area where each
 * block plugin can render its own buttons (e.g. heading level switcher,
 * paragraph alignment).
 *
 * Owns mounting/unmounting of the current plugin's control group:
 * builds an `InlineControlContext`, calls `plugin.renderInlineControls`,
 * appends returned elements into `pluginZone`, and tears them down
 * (calling the group's optional `destroy()`) when the focus moves to
 * a block whose plugin doesn't provide controls.
 */
export class PluginControlsSlot {
  /** @type {HTMLElement} */
  #zoneEl

  /** @type {HTMLElement} */
  #dividerEl

  /** @type {PluginControlsSlotDeps} */
  #deps

  /** @type {import('../types').InlineControlGroup | null} */
  #current = null

  /**
   * @param {HTMLElement} zoneEl  container that holds the rendered controls
   * @param {HTMLElement} dividerEl  divider element shown only when controls are present
   * @param {PluginControlsSlotDeps} deps
   */
  constructor(zoneEl, dividerEl, deps) {
    this.#zoneEl = zoneEl
    this.#dividerEl = dividerEl
    this.#deps = deps
  }

  /**
   * Re-query the current block's plugin and render its inline controls.
   * Idempotent — clears any existing controls before rendering new ones.
   */
  update() {
    this.clear()

    const currentBlock = this.#deps.blocks.getCurrentBlock()
    if (!currentBlock) return

    const renderInlineControls = this.#deps.getInlineControls(currentBlock.type)
    if (!renderInlineControls) return

    /** @type {import('../types').InlineControlContext} */
    const ctx = {
      suppressSelectionChange: () => {
        this.#deps.setSuppressSelectionChange(true)
        // Re-enable on the second rAF — gives DOM swaps a couple of frames
        // to settle before we start tracking selectionchange again.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.#deps.setSuppressSelectionChange(false)
          })
        })
      },
      onContentElementChanged: (newEl) => {
        if (newEl && newEl !== currentBlock.contentElement) {
          currentBlock.replaceContentElement(newEl)
        }
        this.#deps.typeSelector.update()
        this.#deps.events.emit(EditorEvent.CHANGED)
      },
    }

    const group = renderInlineControls(currentBlock.contentElement, ctx)
    if (!group || !group.elements.length) return

    this.#current = group
    for (const element of group.elements) {
      this.#zoneEl.appendChild(element)
    }
    this.#dividerEl.style.display = ''
  }

  /**
   * Tear down the active control group (if any) and hide the divider.
   */
  clear() {
    if (this.#current) {
      this.#current.destroy?.()
      for (const element of this.#current.elements) {
        element.remove()
      }
      this.#current = null
    }
    this.#dividerEl.style.display = 'none'
  }
}
