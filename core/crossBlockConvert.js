import { resolveBlockRange } from './selectionRange.js'
import { closestBlock } from './dom.js'
import { EditorEvent } from './editorEvents.js'
import { rangeStartsAtBeginning, rangeEndsAtEnd } from './splitConvert.js'

/**
 * Cross-block conversion shared by the inline type selector and the block
 * settings menu. Endpoint analysis is completed before any command runs, so
 * an unsupported structured selection is a safe no-op.
 */

/**
 * Check whether a block accepts neutral rich text during conversion.
 * `isTextBlock` does not imply that the plugin root is contenteditable; list
 * and checklist plugins are structured text targets as well.
 * @param {Map<string, import('./types').BlockPlugin>} plugins
 * @param {string} type
 * @returns {boolean}
 */
export function isTextType(plugins, type) {
  const plugin = plugins.get(type)
  if (!plugin) return false
  const ctor = /** @type {import('./types').BlockPluginConstructor} */ (plugin.constructor)
  return ctor?.isTextBlock === true
}

/** @param {Range} range @returns {string} */
function rangeHtml(range) {
  const container = document.createElement('div')
  container.appendChild(range.cloneContents())
  return container.innerHTML
}

/** @param {string} html @returns {boolean} */
function hasTransferableContent(html) {
  const container = document.createElement('div')
  container.innerHTML = html
  if ((container.textContent || '').replace(/\u00a0/g, ' ').trim()) return true
  return !!container.querySelector('img, video, audio, iframe, [data-inline-plugin]')
}

/**
 * Describe one partially selected endpoint without mutating plugin DOM.
 * Structured plugins own their data boundaries through `splitSelection()`;
 * the generic path is intentionally limited to a single editable root whose
 * serialized representation is `{ text }`.
 *
 * @param {import('./types').IBlock} block
 * @param {Range} range
 * @param {'first' | 'last'} side
 * @returns {{ remainingData: Record<string, unknown> | null, selectedData: Record<string, unknown> } | null}
 */
function analyzePartialEndpoint(block, range, side) {
  const content = block.contentElement
  const pluginSplit = block.plugin.splitSelection?.(content, range)
  if (pluginSplit) {
    if (!pluginSplit.selectedData || typeof pluginSplit.selectedData !== 'object' || Array.isArray(pluginSplit.selectedData)) {
      return null
    }
    if (pluginSplit.remainingData !== null && (
      typeof pluginSplit.remainingData !== 'object' || Array.isArray(pluginSplit.remainingData)
    )) return null
    return pluginSplit
  }

  if (content.getAttribute('contenteditable') !== 'true') return null

  try {
    const selectedRange = document.createRange()
    selectedRange.selectNodeContents(content)
    const remainingRange = document.createRange()
    remainingRange.selectNodeContents(content)

    if (side === 'first') {
      selectedRange.setStart(range.startContainer, range.startOffset)
      remainingRange.setEnd(range.startContainer, range.startOffset)
    } else {
      selectedRange.setEnd(range.endContainer, range.endOffset)
      remainingRange.setStart(range.endContainer, range.endOffset)
    }

    const selectedHtml = rangeHtml(selectedRange)
    if (!hasTransferableContent(selectedHtml)) return null
    const remainingHtml = rangeHtml(remainingRange)
    return {
      selectedData: { text: selectedHtml },
      remainingData: hasTransferableContent(remainingHtml) ? { text: remainingHtml } : null,
    }
  } catch {
    return null
  }
}

/**
 * Convert a cross-block selection. A text target receives one converted block
 * per selected source block. A non-text target replaces the selected interval
 * with one block. Unselected endpoint data always stays in its source type.
 *
 * @param {object} ctx
 * @param {import('./types').IBlockManager} ctx.blocks
 * @param {import('./types').ISelectionManager} ctx.selection
 * @param {Map<string, import('./types').BlockPlugin>} ctx.plugins
 * @param {import('./types').ICrossBlockSelection} [ctx.crossBlockSelection]
 * @param {import('./types').IEventBus} [ctx.events]
 * @param {Range} crossRange
 * @param {string} targetType
 * @param {Record<string, unknown>} [targetData]
 * @param {(() => void) | null} [onDone]
 * @returns {boolean} whether the document was changed
 */
export function convertCrossBlockRange(ctx, crossRange, targetType, targetData, onDone) {
  const { blocks, selection, plugins, crossBlockSelection, events } = ctx

  const startBlockEl = closestBlock(/** @type {import('./types').DOMNode} */ (crossRange.startContainer))
  const endBlockEl = closestBlock(/** @type {import('./types').DOMNode} */ (crossRange.endContainer))
  if (!startBlockEl || !endBlockEl) return false

  const startId = startBlockEl.dataset.blockId
  const endId = endBlockEl.dataset.blockId
  if (!startId || !endId) return false
  const firstIdx = blocks.getBlockIndex(startId)
  const lastIdx = blocks.getBlockIndex(endId)
  if (firstIdx < 0 || lastIdx <= firstIdx) return false

  const firstBlock = blocks.getBlockByIndex(firstIdx)
  const lastBlock = blocks.getBlockByIndex(lastIdx)
  const endpoints = resolveBlockRange(blocks, crossRange)
  if (!firstBlock || !lastBlock || endpoints?.first !== firstBlock
      || endpoints.last !== lastBlock || !plugins.has(targetType)) return false

  const firstFull = rangeStartsAtBeginning(firstBlock.contentElement, crossRange)
  const lastFull = rangeEndsAtEnd(lastBlock.contentElement, crossRange)
  const firstSplit = firstFull ? null : analyzePartialEndpoint(firstBlock, crossRange, 'first')
  const lastSplit = lastFull ? null : analyzePartialEndpoint(lastBlock, crossRange, 'last')

  // Do not start a batch or mutate any block until both endpoint contracts are
  // known to be representable. This prevents partial corruption when only one
  // structured plugin supports data-level splitting.
  if ((!firstFull && !firstSplit) || (!lastFull && !lastSplit)) return false

  // Capture transferable metadata before either endpoint is replaced. New
  // fragments get fresh IDs/revisions, but keep the payloads their tokens use.
  const firstMetadata = firstSplit ? firstBlock.save() : null
  const lastMetadata = lastSplit ? lastBlock.save() : null
  const targetIsText = isTextType(plugins, targetType)
  /** @type {import('./types').IBlock[]} */
  const convertedBlocks = []
  /** @type {import('./types').IBlock | null} */
  let focusBlock = null
  const recordConverted = (block) => {
    if (block && !convertedBlocks.includes(block)) convertedBlocks.push(block)
    return block
  }

  events?.emit(EditorEvent.UNDO_BATCH_START)
  try {
    if (targetIsText) {
      // Process from the end so inserted endpoint remainders do not invalidate
      // the model indices of earlier selected blocks.
      if (lastSplit) {
        const converted = blocks.convert(lastIdx, targetType, {
          ...lastSplit.selectedData,
          ...(targetData || {}),
        })
        if (converted) focusBlock = recordConverted(converted)
        if (lastSplit.remainingData) blocks.insert(lastBlock.type, lastSplit.remainingData, lastIdx + 1, undefined, lastMetadata?.inline, lastMetadata?.tunes)
      } else {
        const converted = blocks.convert(lastIdx, targetType, targetData)
        if (converted) focusBlock = recordConverted(converted)
      }

      for (let index = lastIdx - 1; index > firstIdx; index--) {
        const block = blocks.getBlockByIndex(index)
        if (!block) continue
        if (block.type === targetType) {
          focusBlock = recordConverted(block)
          continue
        }
        const converted = blocks.convert(index, targetType, targetData)
        if (converted) focusBlock = recordConverted(converted)
      }

      if (firstSplit) {
        if (firstSplit.remainingData) {
          // Re-render the source from its plugin-owned remaining data. This is
          // safer than rewriting structured DOM and keeps lifecycle ownership.
          blocks.convert(firstIdx, firstBlock.type, firstSplit.remainingData)
          focusBlock = recordConverted(blocks.insert(targetType, {
            ...firstSplit.selectedData,
            ...(targetData || {}),
          }, firstIdx + 1, undefined, firstMetadata?.inline, firstMetadata?.tunes))
        } else {
          const converted = blocks.convert(firstIdx, targetType, {
            ...firstSplit.selectedData,
            ...(targetData || {}),
          })
          if (converted) focusBlock = recordConverted(converted)
        }
      } else {
        const converted = blocks.convert(firstIdx, targetType, targetData)
        if (converted) focusBlock = recordConverted(converted)
      }
    } else {
      // Keep only unselected endpoint data, remove every fully selected block,
      // then place one non-text target between the surviving endpoint blocks.
      if (lastSplit?.remainingData) {
        blocks.convert(lastIdx, lastBlock.type, lastSplit.remainingData)
      } else {
        blocks.remove(lastIdx)
      }

      for (let index = lastIdx - 1; index > firstIdx; index--) blocks.remove(index)

      let insertAt = firstIdx
      if (firstSplit?.remainingData) {
        blocks.convert(firstIdx, firstBlock.type, firstSplit.remainingData)
        insertAt++
      } else {
        blocks.remove(firstIdx)
      }

      focusBlock = blocks.insert(targetType, /** @type {Record<string, unknown>} */ (targetData || {}), insertAt)
    }

    const liveConverted = convertedBlocks
      .filter(block => blocks.getBlockById(block.id) === block)
      .sort((a, b) => blocks.getBlockIndex(a.id) - blocks.getBlockIndex(b.id))
    const newFirstBlock = liveConverted[0]
    const newLastBlock = liveConverted[liveConverted.length - 1]

    if (targetIsText && newFirstBlock && newLastBlock && newFirstBlock !== newLastBlock) {
      try {
        const newRange = document.createRange()
        newRange.selectNodeContents(newFirstBlock.contentElement)
        newRange.setEnd(newLastBlock.contentElement, newLastBlock.contentElement.childNodes.length)
        const editor = /** @type {HTMLElement | null} */ (newFirstBlock.contentElement.closest('.oe-editor'))
        if (crossBlockSelection && editor) crossBlockSelection.activate(newRange, editor)
      } catch { /* focus fallback below */ }

      const newLastIndex = blocks.getBlockIndex(newLastBlock.id)
      if (newLastIndex >= 0) blocks.setCurrentIndex(newLastIndex)
      newLastBlock.focus()
      selection.setCaretToBlock(newLastBlock.id, 'end')
    } else {
      const editor = /** @type {HTMLElement | null} */ (startBlockEl.closest('.oe-editor'))
      crossBlockSelection?.deactivate(editor ?? undefined)
      if (focusBlock) {
        const focusIndex = blocks.getBlockIndex(focusBlock.id)
        if (focusIndex >= 0) blocks.setCurrentIndex(focusIndex)
        selection.setCaretToBlock(focusBlock.id, 'start')
        focusBlock.focus()
      }
    }

    onDone?.()
    return true
  } finally {
    events?.emit(EditorEvent.UNDO_BATCH_END)
  }
}
