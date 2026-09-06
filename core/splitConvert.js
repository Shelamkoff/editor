import { closestBlock } from './dom.js'

/**
 * Shared utility for splitting a block at a selection range and converting
 * the selected portion to a different block type.
 *
 * Used by both TypeSelector (inline toolbar) and BlockSettingsMenu (tune menu).
 *
 * @param {import('./types').IBlockManager} blocks
 * @param {import('./types').ISelectionManager} selection
 * @param {number} currentIndex
 * @param {string} currentType
 * @param {HTMLElement} contentEl
 * @param {Range} range
 * @param {string} targetType
 * @param {Record<string, unknown>} [targetData]
 * @param {boolean} [targetIsText]
 * @returns {boolean} whether conversion actually happened
 */
export function splitAndConvert(blocks, selection, currentIndex, currentType, contentEl, range, targetType, targetData, targetIsText = false) {
  const currentBlock = blocks.getBlockByIndex(currentIndex)
  if (!currentBlock || currentBlock.contentElement !== contentEl
      || !contentEl.contains(range.startContainer) || !contentEl.contains(range.endContainer)) return false
  const metadata = currentBlock?.save()
  const pluginSplit = currentBlock?.plugin.splitSelection?.(contentEl, range)

  if (pluginSplit) {
    const transferable = targetIsText ? pluginSplit.selectedData : {}
    const newData = { ...transferable, ...(targetData || {}) }
    let insertIndex = currentIndex + 1

    if (pluginSplit.remainingData) {
      blocks.convert(currentIndex, currentType, pluginSplit.remainingData)
    } else {
      blocks.remove(currentIndex)
      insertIndex = currentIndex
    }

    const newBlock = blocks.insert(targetType, newData, insertIndex, undefined, metadata?.inline, metadata?.tunes)
    blocks.setCurrentIndex(insertIndex)
    selection.setCaretToBlock(newBlock.id, 'start')
    newBlock.focus()
    return true
  }

  // The generic splitter owns only a single editable root whose HTML maps to
  // `{ text }`. A structured block can contain several editable descendants
  // and plugin-owned controls; rewriting its wrapper.innerHTML would corrupt
  // both its data shape and event handlers. Such plugins must describe a safe
  // data-level split through `splitSelection()`.
  if (contentEl.getAttribute('contenteditable') !== 'true') return false

  // Extract before/selected/after content as HTML
  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(contentEl)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const beforeEl = document.createElement('div')
  beforeEl.appendChild(beforeRange.cloneContents())
  const beforeHtml = beforeEl.innerHTML

  const selectedEl = document.createElement('div')
  selectedEl.appendChild(range.cloneContents())
  const selectedHtml = selectedEl.innerHTML

  const afterRange = document.createRange()
  afterRange.selectNodeContents(contentEl)
  afterRange.setStart(range.endContainer, range.endOffset)
  const afterEl = document.createElement('div')
  afterEl.appendChild(afterRange.cloneContents())
  const afterHtml = afterEl.innerHTML

  if (!selectedHtml) return false

  const mergedData = { text: selectedHtml, ...(targetData || {}) }

  if (!beforeHtml && !afterHtml) {
    const converted = blocks.convert(currentIndex, targetType, mergedData)
    if (converted) {
      blocks.setCurrentIndex(currentIndex)
      selection.setCaretToBlock(converted.id, 'start')
      converted.focus()
    }
    return !!converted
  }

  if (!beforeHtml) {
    contentEl.innerHTML = selectedHtml
    currentBlock?.markDirty()
    const converted = blocks.convert(currentIndex, targetType, mergedData)
    if (afterHtml) {
      blocks.insert(currentType, { text: afterHtml }, currentIndex + 1, undefined, metadata?.inline, metadata?.tunes)
    }
    if (converted) {
      blocks.setCurrentIndex(currentIndex)
      selection.setCaretToBlock(converted.id, 'start')
      converted.focus()
    }
  } else if (!afterHtml) {
    contentEl.innerHTML = beforeHtml
    currentBlock?.markDirty()
    const newBlock = blocks.insert(targetType, mergedData, currentIndex + 1, undefined, metadata?.inline, metadata?.tunes)
    blocks.setCurrentIndex(currentIndex + 1)
    selection.setCaretToBlock(newBlock.id, 'start')
    newBlock.focus()
  } else {
    contentEl.innerHTML = beforeHtml
    currentBlock?.markDirty()
    const newBlock = blocks.insert(targetType, mergedData, currentIndex + 1, undefined, metadata?.inline, metadata?.tunes)
    blocks.insert(currentType, { text: afterHtml }, currentIndex + 2, undefined, metadata?.inline, metadata?.tunes)
    blocks.setCurrentIndex(currentIndex + 1)
    selection.setCaretToBlock(newBlock.id, 'start')
    newBlock.focus()
  }

  return true
}

/**
 * Check if range starts at the beginning of contentEl.
 * @param {HTMLElement} contentEl
 * @param {Range} range
 * @returns {boolean}
 */
export function rangeStartsAtBeginning(contentEl, range) {
  try {
    const full = document.createRange()
    full.selectNodeContents(contentEl)
    return range.compareBoundaryPoints(Range.START_TO_START, full) <= 0
  } catch { return true }
}

/**
 * Check if range ends at the end of contentEl.
 * @param {HTMLElement} contentEl
 * @param {Range} range
 * @returns {boolean}
 */
export function rangeEndsAtEnd(contentEl, range) {
  try {
    const full = document.createRange()
    full.selectNodeContents(contentEl)
    return range.compareBoundaryPoints(Range.END_TO_END, full) >= 0
  } catch { return true }
}

/**
 * Check if entire block content is selected.
 * Returns false on error (conservative — assume nothing is selected).
 * @param {HTMLElement} contentEl
 * @param {Range} range
 * @returns {boolean}
 */
export function isFullBlockSelected(contentEl, range) {
  try {
    return rangeStartsAtBeginning(contentEl, range) && rangeEndsAtEnd(contentEl, range)
  } catch {
    return false
  }
}

/**
 * Restore a saved selection range, including cross-block range and CSS Highlight.
 * @param {Range | null} savedRange
 * @param {import('./types').ICrossBlockSelection} [crossBlockSelection]
 */
export function restoreSelection(savedRange, crossBlockSelection) {
  if (!savedRange) return
  // Never clear a valid live caret in order to restore a Range whose block
  // was deleted or replaced by a structural command. Chromium accepts some
  // detached ranges without throwing, but leaves focus on <body>; the next
  // Ctrl+Z then bypasses the editor and enters native DOM history.
  if (!savedRange.startContainer.isConnected || !savedRange.endContainer.isConnected) return
  const sel = window.getSelection()
  if (sel) {
    try {
      sel.removeAllRanges()
      sel.addRange(savedRange)
    } catch {
      // Range may reference detached DOM nodes
    }
  }
  // Restore cross-block range if applicable
  const startBlock = closestBlock(savedRange.startContainer)
  const endBlock = closestBlock(savedRange.endContainer)
  if (startBlock && endBlock && startBlock !== endBlock && crossBlockSelection) {
    const editor = /** @type {HTMLElement | null} */ (startBlock.closest('.oe-editor'))
    if (editor) {
      crossBlockSelection.activate(savedRange, editor)
    } else {
      crossBlockSelection.set(savedRange)
    }
  }
}
