import { BLOCK_CLASS } from './constants.js'
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

  events?.emit(EditorEvent.UNDO_BATCH_START)

  const startBlockEl = closestBlock(crossRange.startContainer)
  const endBlockEl = closestBlock(crossRange.endContainer)
  if (!startBlockEl || !endBlockEl) return

  // Collect block indices in range
  const container = startBlockEl.parentElement
  if (!container) return

  /** @type {number[]} */
  const indices = []
  let inside = false
  let idx = 0
  for (const child of container.children) {
    if (child === startBlockEl) inside = true
    if (inside && child.classList.contains(BLOCK_CLASS)) indices.push(idx)
    if (child.classList.contains(BLOCK_CLASS)) idx++
    if (child === endBlockEl) break
  }
  if (indices.length === 0) return

  const firstIdx = /** @type {number} */ (indices[0])
  const lastIdx = /** @type {number} */ (indices[indices.length - 1])
  const firstBlock = blocks.getBlockByIndex(firstIdx)
  const lastBlock = blocks.getBlockByIndex(lastIdx)
  if (!firstBlock || !lastBlock) return

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
    afterHtml = (afterEl.textContent || '').trim() ? afterEl.innerHTML.trim() : ''
  }

  let beforeHtml = ''
  if (!firstFull && firstCe.getAttribute('contenteditable')) {
    const beforeRange = document.createRange()
    beforeRange.selectNodeContents(firstCe)
    beforeRange.setEnd(crossRange.startContainer, crossRange.startOffset)
    const beforeEl = document.createElement('div')
    beforeEl.appendChild(beforeRange.cloneContents())
    // Check textContent — empty inline wrappers like <i><b></b></i> have no text
    beforeHtml = (beforeEl.textContent || '').trim() ? beforeEl.innerHTML.trim() : ''
  }

  // Extract selected HTML from first and last partial blocks
  let firstSelectedHtml = ''
  if (!firstFull && firstCe.getAttribute('contenteditable')) {
    const selRange = document.createRange()
    selRange.selectNodeContents(firstCe)
    selRange.setStart(crossRange.startContainer, crossRange.startOffset)
    const selEl = document.createElement('div')
    selEl.appendChild(selRange.cloneContents())
    firstSelectedHtml = selEl.innerHTML.trim()
  }

  let lastSelectedHtml = ''
  if (!lastFull && lastCe.getAttribute('contenteditable') && firstIdx !== lastIdx) {
    const selRange = document.createRange()
    selRange.selectNodeContents(lastCe)
    selRange.setEnd(crossRange.endContainer, crossRange.endOffset)
    const selEl = document.createElement('div')
    selEl.appendChild(selRange.cloneContents())
    lastSelectedHtml = selEl.innerHTML.trim()
  }

  // === Perform conversion ===
  let focusBlock = null

  if (targetIsText) {
    // Text target: convert each block individually, split partials
    // Work in reverse to preserve indices

    // Handle last block (if partial and different from first)
    if (lastIdx !== firstIdx) {
      if (!lastFull && afterHtml) {
        // Split: replace last block content with selected part, add after-remainder
        lastCe.innerHTML = lastSelectedHtml
        const converted = blocks.convert(lastIdx, targetType, targetData)
        if (converted) focusBlock = converted
        blocks.insert(lastBlock.type, { text: afterHtml }, lastIdx + 1)
      } else {
        // Full block — just convert
        const converted = blocks.convert(lastIdx, targetType, targetData)
        if (converted) focusBlock = converted
      }
    }

    // Convert middle blocks (reverse order)
    for (let i = indices.length - 2; i >= 1; i--) {
      const blockIdx = /** @type {number} */ (indices[i])
      const block = blocks.getBlockByIndex(blockIdx)
      if (block && block.type !== targetType) {
        const converted = blocks.convert(blockIdx, targetType, /** @type {Record<string, unknown>} */ (targetData))
        if (converted) focusBlock = converted
      }
    }

    // Handle first block (treat as full if before-content is empty)
    if (beforeHtml) {
      // Split: keep before-part as original type, insert selected part as new block
      firstCe.innerHTML = beforeHtml
      if (firstIdx === lastIdx) {
        // First and last are same block — selected portion is firstSelectedHtml
        // afterHtml already extracted above
        const newBlock = blocks.insert(targetType, { text: firstSelectedHtml, ...(targetData || {}) }, firstIdx + 1)
        if (afterHtml) blocks.insert(firstBlock.type, { text: afterHtml }, firstIdx + 2)
        focusBlock = newBlock
      } else {
        // Insert converted selected portion after before-part
        focusBlock = blocks.insert(targetType, { text: firstSelectedHtml, ...(targetData || {}) }, firstIdx + 1)
      }
    } else {
      // Full first block — convert in place
      const converted = blocks.convert(firstIdx, targetType, targetData)
      if (converted) focusBlock = converted
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
  const newFirstBlock = blocks.getBlockByIndex(firstIdx)
  const newLastIdx = Math.min(firstIdx + indices.length - 1, blocks.getBlockCount() - 1)
  const newLastBlock = blocks.getBlockByIndex(newLastIdx)

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

  events?.emit(EditorEvent.UNDO_BATCH_END)

  if (onDone) onDone()
}
