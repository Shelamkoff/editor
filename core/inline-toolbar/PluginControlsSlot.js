import { invokeObserver } from '../../shared/invokeObserver.js'

/**
 * @typedef {Object} PluginControlsSlotDeps
 * @property {import('../types').IBlockManager} blocks
 * @property {(type: string) => import('../types').BlockPlugin['renderInlineControls'] | undefined} getInlineControls
 * @property {import('../types').IEventBus} events
 * @property {import('../TypeSelector').TypeSelector} typeSelector
 * @property {(suppress: boolean) => void} setSuppressSelectionChange
 * @property {import('../CommandDispatcher').CommandDispatcher} mutations
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

  /** @type {(Window & typeof globalThis) | null} */
  #view

  /** @type {PluginControlsSlotDeps} */
  #deps

  /** @type {import('../types').InlineControlGroup | null} */
  #current = null

  #suppressionGeneration = 0
  #generation = 0
  #destroyed = false
  #suppressed = false

  /**
   * @param {HTMLElement} zoneEl  container that holds the rendered controls
   * @param {HTMLElement} dividerEl  divider element shown only when controls are present
   * @param {PluginControlsSlotDeps} deps
   */
  constructor(zoneEl, dividerEl, deps) {
    this.#zoneEl = zoneEl
    this.#dividerEl = dividerEl
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (zoneEl.ownerDocument?.defaultView ?? null)
    this.#deps = deps
  }

  /**
   * Re-query the current block's plugin and render its inline controls.
   * Idempotent — clears any existing controls before rendering new ones.
   */
  refresh() {
    if (this.#destroyed) return
    const generation = ++this.#generation
    this.#releaseCurrent()
    // A previous group's disposer can open a newer group or tear down the
    // toolbar. The interrupted refresh must never overwrite that newer owner.
    if (this.#destroyed || generation !== this.#generation) return

    const currentBlock = this.#deps.blocks.getCurrentBlock()
    if (!currentBlock) return

    const renderInlineControls = this.#deps.getInlineControls(currentBlock.type)
    if (!renderInlineControls) return

    const live = () => !this.#destroyed && generation === this.#generation
      && this.#deps.blocks.getBlockById(currentBlock.id) === currentBlock

    /** @type {import('../types').InlineControlContext} */
    const ctx = {
      suppressSelectionChange: () => {
        if (!live()) return
        this.#suppressed = true
        const generation = ++this.#suppressionGeneration
        this.#deps.setSuppressSelectionChange(true)
        // Re-enable on the second rAF — gives DOM swaps a couple of frames
        // to settle before we start tracking selectionchange again.
        const schedule = this.#view?.requestAnimationFrame?.bind(this.#view)
          ?? requestAnimationFrame
        schedule(() => {
          if (generation !== this.#suppressionGeneration) return
          schedule(() => {
            if (generation !== this.#suppressionGeneration) return
            this.#suppressed = false
            this.#deps.setSuppressSelectionChange(false)
          })
        })
      },
      mutate: (operation) => live()
        ? this.#deps.mutations.runForBlock(currentBlock, () => live() ? operation() : undefined)
        : undefined,
      onContentElementChanged: (newEl) => {
        if (!live()) return
        const externalMutation = !this.#deps.mutations.active
        if (newEl && newEl !== currentBlock.contentElement) {
          currentBlock.replaceContentElement(newEl)
        }
        this.#deps.typeSelector.update()
        if (externalMutation) this.#deps.mutations.commitExternal(currentBlock)
      },
    }

    let group
    try {
      group = renderInlineControls(currentBlock.contentElement, ctx)
    } catch (err) {
      if (generation === this.#generation) this.clear()
      console.warn(`[PluginControlsSlot] Failed to render controls for "${currentBlock.type}":`, err)
      return
    }
    if (!live() || !group || !group.elements.length) {
      if (generation === this.#generation) this.clear()
      this.#disposeGroup(group)
      return
    }

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
    this.#generation++
    this.#releaseCurrent()
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.clear()
  }

  /** Revoke ownership before calling a group's external disposer. */
  #releaseCurrent() {
    const group = this.#current
    this.#current = null
    this.#suppressionGeneration++
    this.#dividerEl.style.display = 'none'
    if (this.#suppressed) {
      this.#suppressed = false
      this.#deps.setSuppressSelectionChange(false)
    }
    this.#disposeGroup(group)
  }

  /** @param {import('../types').InlineControlGroup | null | undefined} group */
  #disposeGroup(group) {
    if (!group) return
    // Remove this group's elements, not a newer group's elements created by
    // cleanup reentry. Unmounted/empty groups also own their disposer.
    for (const element of group.elements) element.remove()
    invokeObserver(() => group.destroy?.(), [], err => {
      console.warn('[PluginControlsSlot] Failed to destroy plugin controls:', err)
    })
  }
}
