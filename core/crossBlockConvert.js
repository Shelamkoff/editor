import { closestBlock } from './dom.js'
import { EditorEvent } from './editorEvents.js'
import { rangeStartsAtBeginning, rangeEndsAtEnd } from './splitConvert.js'

/**
 * Cross-block conversion utility.
 *
 * Extracts logic shared between TypeSelector (inline toolbar) and
 * BlockSettingsMenu (tune menu) for converting a cross-block range
 * to a different block type with partial-block split support.
 */

/**
 * Check if a block type is text-based (has contenteditable root).
 * Reads the static `isTextBlock` property from the plugin class.
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

/**
 * Convert blocks in a cross-block selection range, with partial split support.
 *
 * Text → text: split partial first/last blocks, convert selected portions.
 * Text → non-text: split partial blocks, remove all selected, insert one new block.
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
 * @param {(() => void) | null} [onDone] - called after conversion (e.g. emit editor:changed)
 */
export function convertCrossBlockRange(ctx, crossRange, targetType, targetData, onDone) {
  const { blocks, selection, plugins, crossBlockSelection, events } = ctx

  const startBlockEl = closestBlock(crossRange.startContainer)
  const endBlockEl = closestBlock(crossRange.endContainer)
  if (!startBlockEl || !endBlockEl) return

  // DOM children can include blocks finishing an exit animation. Resolve the
  // endpoints through BlockManager and derive the interval from model order.
  const startId = startBlockEl.dataset.blockId
  const endId = endBlockEl.dataset.blockId
  if (!startId || !endId) return
  const firstIdx = blocks.getBlockIndex(startId)
  const lastIdx = blocks.getBlockIndex(endId)
  if (firstIdx < 0 || lastIdx < firstIdx) return
  const indices = Array.from({ length: lastIdx - firstIdx + 1 }, (_, offset) => firstIdx + offset)
  const firstBlock = blocks.getBlockByIndex(firstIdx)
  const lastBlock = blocks.getBlockByIndex(lastIdx)
  if (!firstBlock || !lastBlock) return

  // Validation must finish before opening the batch: every early return above
  // is then harmless, and every mutation below is balanced by finally.
  events?.emit(EditorEvent.UNDO_BATCH_START)
  try {
    // Determine if first/last blocks are fully or partially selected
    const firstCe = firstBlock.contentElement
    const lastCe = lastBlock.contentElement

    const firstFull = rangeStartsAtBeginning(firstCe, crossRange)
    const lastFull = rangeEndsAtEnd(lastCe, crossRange)

    // Check if target is text-based (has contenteditable)
    const targetIsText = isTextType(plugins, targetType)

    // === Split partial last block (do last first to preserve indices) ===
    let afterHtml = ''
    if (!lastFull && lastCe.getAttribute('contenteditable')) {
      const afterRange = document.createRange()
      afterRange.selectNodeContents(lastCe)
      afterRange.setStart(crossRange.endContainer, crossRange.endOffset)
      const afterEl = document.createElement('div')
      afterEl.appendChild(afterRange.cloneContents())
      afterHtml = afterEl.innerHTML
    }

    let beforeHtml = ''
    if (!firstFull && firstCe.getAttribute('contenteditable')) {
      const beforeRange = document.createRange()
      beforeRange.selectNodeContents(firstCe)
      beforeRange.setEnd(crossRange.startContainer, crossRange.startOffset)
      const beforeEl = document.createElement('div')
      beforeEl.appendChild(beforeRange.cloneContents())
      // Check textContent — empty inline wrappers like <i><b></b></i> have no text
      beforeHtml = beforeEl.innerHTML
    }

    // Extract selected HTML from first and last partial blocks
    let firstSelectedHtml = ''
    if (!firstFull && firstCe.getAttribute('contenteditable')) {
      const selRange = document.createRange()
      selRange.selectNodeContents(firstCe)
      selRange.setStart(crossRange.startContainer, crossRange.startOffset)
      const selEl = document.createElement('div')
      selEl.appendChild(selRange.cloneContents())
      firstSelectedHtml = selEl.innerHTML
    }

    let lastSelectedHtml = ''
    if (!lastFull && lastCe.getAttribute('contenteditable') && firstIdx !== lastIdx) {
      const selRange = document.createRange()
      selRange.selectNodeContents(lastCe)
      selRange.setEnd(crossRange.endContainer, crossRange.endOffset)
      const selEl = document.createElement('div')
      selEl.appendChild(selRange.cloneContents())
      lastSelectedHtml = selEl.innerHTML
    }

    // === Perform conversion ===
    let focusBlock = null
    const convertedBlocks = []
    const recordConverted = (block) => {
      if (block && !convertedBlocks.includes(block)) convertedBlocks.push(block)
      return block
    }

    if (targetIsText) {
      // Text target: convert each block individually, split partials
      // Work in reverse to preserve indices

      // Handle last block (if partial and different from first)
      if (lastIdx !== firstIdx) {
        if (!lastFull && afterHtml) {
          // Split: replace last block content with selected part, add after-remainder
          lastCe.innerHTML = lastSelectedHtml
          lastBlock.markDirty()
          const converted = blocks.convert(lastIdx, targetType, targetData)
          if (converted) focusBlock = recordConverted(converted)
          blocks.insert(lastBlock.type, { text: afterHtml }, lastIdx + 1)
        } else {
          // Full block — just convert
          const converted = blocks.convert(lastIdx, targetType, targetData)
          if (converted) focusBlock = recordConverted(converted)
        }
      }

      // Convert middle blocks (reverse order)
      for (let i = indices.length - 2; i >= 1; i--) {
        const blockIdx = /** @type {number} */ (indices[i])
        const block = blocks.getBlockByIndex(blockIdx)
        if (block) {
          if (block.type !== targetType) {
            const converted = blocks.convert(blockIdx, targetType, /** @type {Record<string, unknown>} */ (targetData))
            if (converted) focusBlock = recordConverted(converted)
          } else {
            recordConverted(block)
          }
        }
      }

      // Handle first block (treat as full if before-content is empty)
      if (beforeHtml) {
        // Split: keep before-part as original type, insert selected part as new block
        firstCe.innerHTML = beforeHtml
        firstBlock.markDirty()
        if (firstIdx === lastIdx) {
          // First and last are same block — selected portion is firstSelectedHtml
          // afterHtml already extracted above
          const newBlock = blocks.insert(targetType, { text: firstSelectedHtml, ...(targetData || {}) }, firstIdx + 1)
          if (afterHtml) blocks.insert(firstBlock.type, { text: afterHtml }, firstIdx + 2)
          focusBlock = recordConverted(newBlock)
        } else {
          // Insert converted selected portion after before-part
          focusBlock = recordConverted(blocks.insert(targetType, { text: firstSelectedHtml, ...(targetData || {}) }, firstIdx + 1))
        }
      } else if (firstIdx === lastIdx && !lastFull && afterHtml) {
        firstCe.innerHTML = firstSelectedHtml
        firstBlock.markDirty()
        const converted = blocks.convert(firstIdx, targetType, targetData)
        if (converted) focusBlock = recordConverted(converted)
        blocks.insert(firstBlock.type, { text: afterHtml }, firstIdx + 1)
      } else {
        // Full first block — convert in place
        const converted = blocks.convert(firstIdx, targetType, targetData)
        if (converted) focusBlock = recordConverted(converted)
      }
    } else {
      // Non-text target: remove all selected blocks, insert one new block + after-remainder

      // Remove blocks in reverse (preserves indices)
      for (let i = indices.length - 1; i >= 0; i--) {
        blocks.remove(/** @type {number} */ (indices[i]))
      }

      // Insert: before-remainder (if any) → new block → after-remainder (if any)
      let insertAt = firstIdx
      if (beforeHtml) {
        blocks.insert(firstBlock.type, { text: beforeHtml }, insertAt)
        insertAt++
      }

      focusBlock = blocks.insert(targetType, /** @type {Record<string, unknown>} */ (targetData || {}), insertAt)
      insertAt++

      if (afterHtml) {
        blocks.insert(lastBlock.type, { text: afterHtml }, insertAt)
      }
    }

    // Rebuild cross-block selection on converted blocks
    const liveConverted = convertedBlocks
      .filter(block => blocks.getBlockById(block.id) === block)
      .sort((a, b) => blocks.getBlockIndex(a.id) - blocks.getBlockIndex(b.id))
    const newFirstBlock = liveConverted[0]
    const newLastBlock = liveConverted[liveConverted.length - 1]

    if (targetIsText && newFirstBlock && newLastBlock && newFirstBlock !== newLastBlock) {
      // Multiple blocks — restore cross-block selection
      const newFirstCe = newFirstBlock.contentElement
      const newLastCe = newLastBlock.contentElement
      try {
        const newRange = document.createRange()
        newRange.setStart(newFirstCe, 0)
        newRange.setEnd(newLastCe, newLastCe.childNodes.length)
        const editor = /** @type {HTMLElement | null} */ (newFirstCe.closest('.oe-editor'))
        if (crossBlockSelection && editor) {
          crossBlockSelection.activate(newRange, editor)
        }
      } catch { /* fallback below */ }

      // Focus the last converted block so keyboard shortcuts (Ctrl+Z) work
      if (newLastBlock) {
        const lastIdx2 = blocks.getBlockIndex(newLastBlock.id)
        if (lastIdx2 >= 0) blocks.setCurrentIndex(lastIdx2)
        newLastBlock.focus()
        // Place native caret at end of last block
        selection.setCaretToBlock(newLastBlock.id, 'end')
      }
    } else {
      // Single block or fallback
      if (crossBlockSelection) {
        const editor = /** @type {HTMLElement | null} */ (startBlockEl.closest('.oe-editor'))
        crossBlockSelection.deactivate(editor ?? undefined)
      }
      if (focusBlock) {
        const focusIdx2 = blocks.getBlockIndex(focusBlock.id)
        if (focusIdx2 >= 0) blocks.setCurrentIndex(focusIdx2)
        selection.setCaretToBlock(focusBlock.id, 'start')
        focusBlock.focus()
      }
    }

    if (onDone) onDone()
  } finally {
    events?.emit(EditorEvent.UNDO_BATCH_END)
  }
}
