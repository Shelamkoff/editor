import { hydrateInlineWidget } from './hydrateInlinePlugins.js'
import { EditorEvent } from './editorEvents.js'
import { hydrateInlinePlugins } from './hydrateInlinePlugins.js'

/** Pattern replacement must use the same authored-field boundary as public
 * inline insertion. A block's wrapper also contains UI and literal source code.
 * @param {Text} node
 * @param {import('./types').IBlock} block
 */
function ownsPatternText(node, block) {
  if (typeof block.plugin.mapTextFields !== 'function') return false
  const parent = node.parentElement
  if (parent?.closest('[data-inline-plugin], input, textarea, select, button')) return false
  const field = /** @type {HTMLElement | null | undefined} */ (parent?.closest('[contenteditable]'))
  return field?.contentEditable === 'true' && block.contentElement.contains(field)
}

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

  /** @type {Document} */
  #document

  /** @type {(Window & typeof globalThis) | null} */
  #view

  /** @type {import('./types').IInlinePluginRegistry} */
  #registry

  /** @type {import('./types').InlinePluginContext} */
  #ctx

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {import('./CommandDispatcher').CommandDispatcher} */
  #mutations

  /** @type {() => void} */
  #unsubscribePasteApplied

  /** @type {PatternEntry[]} */
  #patterns = []

  /**
   * @param {HTMLElement} rootEl
   * @param {import('./types').IInlinePluginRegistry} registry
   * @param {import('./types').InlinePluginContext} ctx
   * @param {import('./types').IEventBus} events
   * @param {import('./types').IBlockManager} blocks
   * @param {import('./CommandDispatcher').CommandDispatcher} commands
   */
  constructor(rootEl, registry, ctx, events, blocks, commands) {
    this.#rootEl = rootEl
    this.#document = rootEl.ownerDocument
    this.#view = /** @type {(Window & typeof globalThis) | null} */ (this.#document.defaultView)
    this.#registry = registry
    this.#ctx = ctx
    this.#events = events
    this.#blocks = blocks
    this.#mutations = commands

    // Collect all patterns from plugins
    for (const plugin of registry.values()) {
      if (plugin.pasteConfig?.patterns) {
        for (const pattern of plugin.pasteConfig.patterns) {
          this.#patterns.push({ plugin, pattern })
        }
      }
    }

    if (this.#patterns.length === 0) return

    this.#unsubscribePasteApplied = events.on(EditorEvent.PASTE_APPLIED, this.#onPasteApplied)
    rootEl.addEventListener('keydown', this.#onKeyDown)
  }

  destroy() {
    this.#unsubscribePasteApplied?.()
    this.#rootEl.removeEventListener('keydown', this.#onKeyDown)
  }

  /**
   * Scan the exact block interval affected by Clipboard while its undo batch
   * is still open, so paste + automatic widgets remain one history step.
   * @param {{ startBlockId?: string, endBlockId?: string }} payload
   */
  #onPasteApplied = (payload = {}) => {
    const start = payload.startBlockId
      ? this.#blocks.getBlockIndex(payload.startBlockId)
      : this.#blocks.getCurrentIndex()
    const end = payload.endBlockId
      ? this.#blocks.getBlockIndex(payload.endBlockId)
      : this.#blocks.getCurrentIndex()
    if (start < 0 || end < 0) return

    const candidates = []
    for (let index = Math.min(start, end); index <= Math.max(start, end); index++) {
      const block = this.#blocks.getBlockByIndex(index)
      if (block) candidates.push(block)
    }
    this.#replacePatterns(candidates)
  }

  /**
   * On space/Enter, check if the word before caret matches a pattern.
   */
  #onKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return

    // Root-level keydown also receives native controls and other editor UI.
    // Only complete patterns for the contenteditable host that actually owns
    // this key event; the native selection may still point at an older range.
    const target = /** @type {Element | null} */ (e.target)
    const editingHost = target?.closest?.('[contenteditable="true"]') ?? null
    if (!editingHost || !this.#rootEl.contains(editingHost)) return

    const sel = this.#view?.getSelection()
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return

    const node = sel.anchorNode
    if (!node || node.nodeType !== 3 || !editingHost.contains(node)) return
    const textNode = /** @type {import('./types').DOMText} */ (node)
    const block = this.#blocks.getBlockByChildNode(node)
    if (!block || !ownsPatternText(textNode, block)) return

    const offset = sel.anchorOffset
    const text = textNode.data
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
      if (this.#matches(pattern, word)) {
        e.preventDefault()
        e.stopPropagation()
        this.#mutations.runForBlock(block, () => {
          this.#replaceMatch(textNode, wordStart, offset, plugin, word)

          // Insert the space that was suppressed by preventDefault
          if (e.key === ' ') {
            const r = sel.getRangeAt(0)
            const spaceNode = this.#document.createTextNode(' ')
            r.insertNode(spaceNode)
            r.setStartAfter(spaceNode)
            r.collapse(true)
            sel.removeAllRanges()
            sel.addRange(r)
          }
        })
        return
      }
    }
  }

  /** @param {import('./types').IBlock[]} blocks */
  #replacePatterns(blocks) {
    /** @type {Map<import('./types').IBlock, { node: import('./types').DOMText, match: string, start: number, end: number, plugin: import('./types').InlinePlugin }[]>} */
    const matchesByBlock = new Map()
    const showText = this.#view?.NodeFilter?.SHOW_TEXT ?? 4
    for (const block of blocks) {
      if (typeof block.plugin.mapTextFields !== 'function') continue
      const matches = []
      const walker = this.#document.createTreeWalker(block.contentElement, showText)
      while (walker.nextNode()) {
        const node = /** @type {import('./types').DOMText} */ (walker.currentNode)
        if (!ownsPatternText(node, block)) continue
        this.#findMatches(node.textContent || '', node, matches)
      }
      if (matches.length > 0) matchesByBlock.set(block, matches)
    }
    if (matchesByBlock.size === 0) return

    const selection = this.#view?.getSelection()
    const caret = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    const backward = caret && !caret.collapsed && selection.anchorNode === caret.endContainer
      && selection.anchorOffset === caret.endOffset

    this.#mutations.runForBlocks(matchesByBlock.keys(), () => {
      for (const [block, matches] of matchesByBlock) {
        for (let index = matches.length - 1; index >= 0; index--) {
          const match = matches[index]
          if (match) this.#replaceMatch(match.node, match.start, match.end, match.plugin, match.match, false)
        }
        hydrateInlinePlugins(block.contentElement, this.#registry, this.#ctx)
      }
      // Reattach the live bookmark after DOM splits. Merely letting its offsets
      // update can leave the browser's native editing caret at an earlier node.
      if (caret && selection && this.#rootEl.contains(caret.startContainer) && this.#rootEl.contains(caret.endContainer)) {
        selection.removeAllRanges()
        selection.addRange(caret)
        if (backward) selection.setBaseAndExtent(caret.endContainer, caret.endOffset, caret.startContainer, caret.startOffset)
      }
    })
  }

  /**
   * Find all pattern matches in a text string.
   * @param {string} text
   * @param {import('./types').DOMText} node
   * @param {{ node: import('./types').DOMText, match: string, start: number, end: number, plugin: import('./types').InlinePlugin }[]} results
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
        if (this.#matches(pattern, segment)) {
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
   * RegExp instances are plugin-owned and may use `g` or `y`. Calling
   * `test()` on those expressions mutates `lastIndex`, which otherwise makes
   * identical adjacent patterns match only intermittently.
   * @param {RegExp} pattern
   * @param {string} value
   */
  #matches(pattern, value) {
    pattern.lastIndex = 0
    const matched = pattern.test(value)
    pattern.lastIndex = 0
    return matched
  }

  /**
   * Replace a text range with an inline plugin widget.
   * @param {import('./types').DOMText} textNode
   * @param {number} start
   * @param {number} end
   * @param {import('./types').InlinePlugin} plugin
   * @param {string} matchText
   * @param {boolean} [placeCaret=true] Only interactive word completion owns caret placement.
   */
  #replaceMatch(textNode, start, end, plugin, matchText, placeCaret = true) {
    const data = plugin.onPatternMatch?.(matchText) ?? { value: matchText }
    const widget = plugin.createWidget(data, undefined, { ownerDocument: textNode.ownerDocument })
    const HTMLElementCtor = widget?.ownerDocument?.defaultView?.HTMLElement
    if (HTMLElementCtor ? !(widget instanceof HTMLElementCtor) : !(widget instanceof HTMLElement)) {
      throw new TypeError(`Inline plugin "${plugin.type}" createWidget() must return an HTMLElement`)
    }

    // Split text node to isolate the match
    if (end < textNode.length) {
      textNode.splitText(end)
    }
    const targetNode = start > 0
      ? /** @type {import('./types').DOMText} */ (textNode.splitText(start))
      : textNode

    // Replace the matched text with widget
    targetNode.parentNode?.insertBefore(widget, targetNode)
    targetNode.remove()

    // Hydrate immediately
    hydrateInlineWidget(widget, plugin, this.#ctx)
    widget.dataset.hydrated = '1'

    // Batch paste already positioned the caret at its complete insertion
    // boundary. Native ranges follow splitText/removal; do not move it to each
    // earlier match while walking the batch backwards.
    const sel = placeCaret ? this.#view?.getSelection() : null
    if (sel) {
      const range = this.#document.createRange()
      range.setStartAfter(widget)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }
}
