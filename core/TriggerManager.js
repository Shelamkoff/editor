import { EditorEvent } from './editorEvents.js'

/**
 * Listens for trigger characters (e.g. '@' for mentions) in contenteditable blocks
 * and activates the corresponding inline plugin.
 */
export class TriggerManager {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('./types').IInlinePluginRegistry} */
  #registry

  /** @type {import('./types').InlinePluginContext} */
  #ctx

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {Set<string>} */
  #triggerChars

  /** @type {{ plugin: import('./types').InlinePlugin, startNode: import('./types').DOMText, startOffset: number } | null} */
  #active = null

  /** @type {() => void} */
  #unsubscribeBlockChanged

  /**
   * @param {HTMLElement} rootEl
   * @param {import('./types').IInlinePluginRegistry} registry
   * @param {import('./types').InlinePluginContext} ctx
   * @param {import('./types').IEventBus} events
   */
  constructor(rootEl, registry, ctx, events) {
    this.#rootEl = rootEl
    this.#registry = registry
    this.#ctx = ctx
    this.#events = events

    this.#triggerChars = new Set(registry.triggerKeys())

    rootEl.addEventListener('input', this.#onInput)
    rootEl.addEventListener('keydown', this.#onKeyDown, true)
    this.#unsubscribeBlockChanged = events.on(EditorEvent.BLOCK_CHANGED, () => {
      if (this.#active && !this.#active.startNode.isConnected) this.#cancelTrigger()
    })
  }

  destroy() {
    this.#rootEl.removeEventListener('input', this.#onInput)
    this.#rootEl.removeEventListener('keydown', this.#onKeyDown, true)
    this.#unsubscribeBlockChanged()
    this.#cancelTrigger()
  }

  #onInput = () => {
    if (this.#active) {
      // Active trigger session — update plugin with current text
      this.#updateActiveTrigger()
      return
    }

    // Check if a trigger character was just typed
    const sel = window.getSelection()
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return

    const node = sel.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) return
    const textNode = /** @type {import('./types').DOMText} */ (node)

    const offset = sel.anchorOffset
    if (offset === 0) return

    const textBeforeCaret = textNode.data.slice(0, offset)
    const char = Array.from(textBeforeCaret).at(-1)
    if (!char || !this.#triggerChars.has(char)) return

    const triggerOffset = offset - char.length

    // Check that trigger is at word boundary (start of text or preceded by space)
    if (triggerOffset > 0) {
      const prevChar = Array.from(textNode.data.slice(0, triggerOffset)).at(-1)
      if (prevChar && prevChar !== ' ' && prevChar !== '\u00A0') return
    }

    const plugin = this.#registry.getByTrigger(char)
    if (!plugin) return

    this.#active = {
      plugin,
      startNode: textNode,
      startOffset: triggerOffset,
    }

    // Notify plugin that trigger started
    if (plugin.onEdit) {
      plugin.onEdit(/** @type {HTMLElement} */ (node.parentElement), '', this.#ctx)
    }
  }

  #updateActiveTrigger() {
    if (!this.#active) return

    const { plugin, startNode, startOffset } = this.#active

    // Extract text between trigger and current caret
    const sel = window.getSelection()
    if (!sel || !sel.isCollapsed) {
      this.#cancelTrigger()
      return
    }

    const currentNode = sel.anchorNode
    const currentOffset = sel.anchorOffset

    // An empty query is significant: a plugin may restore its initial
    // suggestions after the user removes the last query character.
    if (currentNode === startNode) {
      const trigger = plugin.trigger ?? ''
      const triggerEnd = startOffset + trigger.length
      if (!trigger || !startNode.data.startsWith(trigger, startOffset) || currentOffset < triggerEnd) {
        this.#cancelTrigger()
        return
      }
      const query = startNode.data.slice(triggerEnd, currentOffset)
      const parentEl = /** @type {HTMLElement} */ (startNode.parentElement)
      if (plugin.onEdit) {
        plugin.onEdit(parentEl, query, this.#ctx)
      }
    } else {
      // Caret moved to different node — cancel trigger
      this.#cancelTrigger()
    }
  }

  #onKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (!this.#active) return

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.#cancelTrigger()
    }
  }

  #cancelTrigger() {
    if (!this.#active) return
    const plugin = this.#active.plugin
    this.#active = null
    this.#ctx.hidePopup()
    plugin.onCancel?.()
  }

  /** @returns {boolean} */
  get isActive() {
    return this.#active !== null
  }
}
