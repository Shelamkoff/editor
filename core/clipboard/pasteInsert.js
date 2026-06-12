import { sanitizeHtml } from '../sanitize.js'
import { extractBlockElements } from './pasteUtils.js'

/**
 * @typedef {Object} InsertContext
 * @property {import('../types').IBlockManager} blocks
 * @property {import('../types').ISelectionManager} selection
 * @property {import('../BlockOperations').BlockOperations} blockOps
 * @property {string} defaultBlockType
 * @property {import('./PasteRouter.js').PasteRouter} router
 * @property {() => void} notifyChanged
 */

/**
 * Insert plain text into the editor at the current caret.
 * Multi-line text becomes one block per non-empty line.
 *
 * @param {string} text
 * @param {InsertContext} ctx
 */
export function pastePlainText(text, ctx) {
  const lines = text.split(/\n/)
  const nonEmpty = lines.filter((line) => line.length > 0)
  if (nonEmpty.length === 0) return

  if (nonEmpty.length === 1) {
    insertTextOrReplace(/** @type {string} */ (nonEmpty[0]), ctx.blocks)
    ctx.notifyChanged()
    return
  }

  insertTextOrReplace(/** @type {string} */ (nonEmpty[0]), ctx.blocks)

  const currentIndex = ctx.blocks.getCurrentIndex()
  let insertIndex = currentIndex + 1

  for (let i = 1; i < nonEmpty.length; i++) {
    const escaped = /** @type {string} */ (nonEmpty[i])
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    ctx.blocks.insert(ctx.defaultBlockType, { text: escaped }, insertIndex)
    insertIndex++
  }

  // Focus the last inserted block once (avoid intermediate focus shifts).
  const lastBlock = ctx.blocks.getBlockByIndex(insertIndex - 1)
  if (lastBlock) {
    ctx.blocks.setCurrentIndex(insertIndex - 1)
    ctx.selection.setCaretToBlock(lastBlock.id, 'end')
    lastBlock.focus()
  }

  ctx.notifyChanged()
}

/**
 * Insert HTML into the editor at the current caret.
 * Splits multi-element HTML into multiple blocks via `extractBlockElements`,
 * routes known tags to plugins via `pasteConfig.tags`, and falls back to
 * the default block type for unknown tags.
 *
 * @param {string} html
 * @param {InsertContext} ctx
 */
export function pasteHtml(html, ctx) {
  const temp = document.createElement('div')
  temp.innerHTML = html

  const extracted = extractBlockElements(temp)
    .filter((b) => (b.element.textContent || '').trim())

  if (extracted.length === 0) return

  const first = /** @type {import('./pasteUtils.js').ExtractedBlock} */ (extracted[0])

  // Single paragraph → inline insert into the current block.
  if (extracted.length === 1 && first.tag === 'p') {
    const sanitized = sanitizeHtml(first.element.innerHTML)
    if (sanitized) insertHtmlAtCaret(sanitized)
    return
  }

  const currentIndex = ctx.blocks.getCurrentIndex()
  const currentBlock = ctx.blocks.getBlockByIndex(currentIndex)
  const currentIsEmpty = currentBlock?.isEmpty()

  const firstIsTextLike = first.tag === 'p' || first.tag === 'div'

  if (firstIsTextLike) {
    const sanitized = sanitizeHtml(first.element.innerHTML)
    if (sanitized) {
      if (currentIsEmpty && currentBlock) {
        currentBlock.contentElement.innerHTML = sanitized
      } else {
        insertHtmlAtCaret(sanitized)
      }
    }
  } else {
    insertBlockFromExtracted(first, currentIndex + 1, ctx)
  }

  let insertIndex = currentIndex + 1
  if (!firstIsTextLike) insertIndex++

  for (let i = 1; i < extracted.length; i++) {
    const item = /** @type {import('./pasteUtils.js').ExtractedBlock} */ (extracted[i])
    insertBlockFromExtracted(item, insertIndex, ctx)
    insertIndex++
  }

  if (extracted.length > 1 || first.tag !== 'p') {
    const lastIdx = insertIndex - 1
    const lastBlock = ctx.blocks.getBlockByIndex(lastIdx)
    if (lastBlock) {
      ctx.blocks.setCurrentIndex(lastIdx)
      ctx.selection.setCaretToBlock(lastBlock.id, 'end')
      lastBlock.focus()
    }
  }

  ctx.notifyChanged()
}

/**
 * @param {import('./pasteUtils.js').ExtractedBlock} extracted
 * @param {number} index
 * @param {InsertContext} ctx
 */
function insertBlockFromExtracted(extracted, index, ctx) {
  const plugin = ctx.router.findByTag(extracted.tag)

  if (plugin?.onPaste) {
    const data = plugin.onPaste({
      type: 'tag',
      element: extracted.element,
      tag: extracted.tag,
    })
    if (data) {
      ctx.blocks.insert(plugin.type, data, index)
      return
    }
  }

  const sanitized = sanitizeHtml(extracted.element.innerHTML)
  ctx.blocks.insert(ctx.defaultBlockType, { text: sanitized }, index)
}

/**
 * Insert text at the native caret. Falls back to overwriting the current
 * block's content if no native selection exists.
 *
 * @param {string} text
 * @param {import('../types').IBlockReader} blocks
 */
function insertTextOrReplace(text, blocks) {
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    insertTextAtCaret(text)
    return
  }
  const block = blocks.getCurrentBlock()
  if (block) block.contentElement.textContent = text
}

/** @param {string} text */
function insertTextAtCaret(text) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const textNode = document.createTextNode(text)
  range.insertNode(textNode)
  range.setStartAfter(textNode)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** @param {string} html */
function insertHtmlAtCaret(html) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const temp = document.createElement('div')
  temp.innerHTML = html
  const frag = document.createDocumentFragment()
  /** @type {Node | null} */
  let lastNode = null
  while (temp.firstChild) {
    lastNode = frag.appendChild(temp.firstChild)
  }
  range.insertNode(frag)
  if (lastNode) {
    range.setStartAfter(lastNode)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}
