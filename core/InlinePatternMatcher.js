import { EditorEvent } from './editorEvents.js'
import { hydrateInlinePlugins } from './hydrateInlinePlugins.js'

/**
 * @typedef {{ plugin: import('./types').InlinePlugin, pattern: RegExp }} PatternEntry
 */

/**
 * Matches text patterns in contenteditable blocks and replaces them with inline plugin widgets.
 * Handles:
 * - Paste: scan all text nodes after paste for pattern matches
 * - Input: when space/Enter is typed, check previous word for pattern match
 */
export class InlinePatternMatcher {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('./InlinePluginRegistry').InlinePluginRegistry} */
  #registry

  /** @type {import('./types').InlinePluginContext} */
  #ctx

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {PatternEntry[]} */
  #patterns = []

  /**
   * @param {HTMLElement} rootEl
   * @param {import('./InlinePluginRegistry').InlinePluginRegistry} registry
   * @param {import('./types').InlinePluginContext} ctx
   * @param {import('./types').IEventBus} events
   * @param {import('./types').IBlockManager} blocks
   */
  constructor(rootEl, registry, ctx, events, blocks) {
    this.#rootEl = rootEl
    this.#registry = registry
    this.#ctx = ctx
    this.#events = events
    this.#blocks = blocks

    // Collect all patterns from plugins
    for (const plugin of registry.values()) {
      if (plugin.pasteConfig?.patterns) {
        for (const pattern of plugin.pasteConfig.patterns) {
          this.#patterns.push({ plugin, pattern })
        }
      }
    }

    if (this.#patterns.length === 0) return

    rootEl.addEventListener('paste', this.#onPaste, true)
    rootEl.addEventListener('keydown', this.#onKeyDown)
  }

  destroy() {
    this.#rootEl.removeEventListener('paste', this.#onPaste, true)
    this.#rootEl.removeEventListener('keydown', this.#onKeyDown)
  }

  /**
   * After paste, scan inserted text nodes for pattern matches.
   */
  #onPaste = () => {
    // Use requestAnimationFrame to let the paste complete first
    requestAnimationFrame(() => {
      const block = this.#blocks.getCurrentBlock()
      if (!block) return

      const ce = block.contentElement
      let replaced = false

      // Walk all text nodes and check for patterns
      const walker = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT)
      /** @type {{ node: Text, match: string, start: number, end: number, plugin: import('./types').InlinePlugin }[]} */
      const matches = []

      while (walker.nextNode()) {
        const node = /** @type {Text} */ (walker.currentNode)
        // Skip text inside inline plugin widgets
        if (node.parentElement?.closest('[data-inline-plugin]')) continue

        const text = node.textContent || ''
        this.#findMatches(text, node, matches)
      }

      // Replace matches in reverse order to preserve offsets
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        if (!m) continue
        this.#replaceMatch(m.node, m.start, m.end, m.plugin, m.match)
        replaced = true
      }

      if (replaced) {
        hydrateInlinePlugins(ce, this.#registry, this.#ctx)
        this.#events.emit(EditorEvent.CHANGED)
      }
    })
  }

  /**
   * On space/Enter, check if the word before caret matches a pattern.
   */
  #onKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return

    const sel = window.getSelection()
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return

    const node = sel.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) return
    // Skip inside inline plugin widgets
    if (/** @type {Element | null} */ (node.parentElement)?.closest('[data-inline-plugin]')) return

    const offset = sel.anchorOffset
    const text = /** @type {Text} */ (node).data
    if (!text || offset === 0) return

    // Extract the word before caret (back to previous space or start)
    let wordStart = offset - 1
    while (wordStart > 0 && text[wordStart - 1] !== ' ' && text[wordStart - 1] !== '\u00A0') {
      wordStart--
    }

    const word = text.slice(wordStart, offset)
    if (!word) return

    // Check against patterns
    for (const { plugin, pattern } of this.#patterns) {
      if (pattern.test(word)) {
        e.preventDefault()
        e.stopPropagation()

        this.#replaceMatch(/** @type {Text} */ (node), wordStart, offset, plugin, word)

        // Insert the space that was suppressed by preventDefault
        if (e.key === ' ') {
          const r = sel.getRangeAt(0)
          const spaceNode = document.createTextNode(' ')
          r.insertNode(spaceNode)
          r.setStartAfter(spaceNode)
          r.collapse(true)
          sel.removeAllRanges()
          sel.addRange(r)
        }

        this.#events.emit(EditorEvent.CHANGED)
        return
      }
    }
  }

  /**
   * Find all pattern matches in a text string.
   * @param {string} text
   * @param {Text} node
   * @param {{ node: Text, match: string, start: number, end: number, plugin: import('./types').InlinePlugin }[]} results
   */
  #findMatches(text, node, results) {
    // Split text by whitespace and check each word
    const words = text.split(/(\s+)/)
    let pos = 0

    for (const segment of words) {
      if (/^\s+$/.test(segment)) {
        pos += segment.length
        continue
      }

      for (const { plugin, pattern } of this.#patterns) {
        if (pattern.test(segment)) {
          results.push({
            node,
            match: segment,
            start: pos,
            end: pos + segment.length,
            plugin,
          })
          break // One match per word
        }
      }

      pos += segment.length
    }
  }

  /**
   * Replace a text range with an inline plugin widget.
   * @param {Text} textNode
   * @param {number} start
   * @param {number} end
   * @param {import('./types').InlinePlugin} plugin
   * @param {string} matchText
   */
  #replaceMatch(textNode, start, end, plugin, matchText) {
    const data = plugin.onPatternMatch?.(matchText) ?? { value: matchText }
    const widget = plugin.createWidget(data)

    // Split text node to isolate the match
    if (end < textNode.length) {
      textNode.splitText(end)
    }
    const targetNode = start > 0
      ? /** @type {Text} */ (textNode.splitText(start))
      : textNode

    // Replace the matched text with widget
    targetNode.parentNode?.insertBefore(widget, targetNode)
    targetNode.remove()

    // Hydrate immediately
    plugin.hydrate(widget, this.#ctx)
    widget.dataset.hydrated = '1'

    // Place caret after widget
    const sel = window.getSelection()
    if (sel) {
      const range = document.createRange()
      range.setStartAfter(widget)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }
}
