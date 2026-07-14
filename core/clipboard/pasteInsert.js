import { sanitizeHtml } from '../sanitize.js'
import { extractBlockElements } from './pasteUtils.js'

/**
 * @typedef {Object} InsertContext
 * @property {import('../types').IBlockManager} blocks
 * @property {import('../types').ISelectionManager} selection
 * @property {import('../BlockOperations').BlockOperations} blockOps
 * @property {string} defaultBlockType
 * @property {import('./PasteRouter.js').PasteRouter} router
 * @property {(...blocks: import('../types').IBlock[]) => void} notifyChanged
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
  // Keep the original target before a multi-block paste moves current/focus
  // to the last inserted block. This existing block is mutated directly and
  // must be invalidated explicitly for the pre/post-paste history snapshots.
  const targetBlock = ctx.blocks.getCurrentBlock()

  if (nonEmpty.length === 1) {
    insertTextOrReplace(/** @type {string} */ (nonEmpty[0]), ctx.blocks)
    if (targetBlock) ctx.notifyChanged(targetBlock)
    else ctx.notifyChanged()
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

  if (targetBlock) ctx.notifyChanged(targetBlock)
  else ctx.notifyChanged()
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
  // Parse clipboard markup in inert template content. Individual extracted
  // blocks are sanitized before insertion or handed to an explicit plugin
  // paste handler; no untrusted subtree is connected to the live document.
  const template = document.createElement('template')
  template.innerHTML = html

  const extracted = extractBlockElements(
    template.content,
    (tag) => !!ctx.router.findByTag(tag),
  )
    // Routed non-text elements (for example IMG/HR) may have no textContent
    // and still carry meaningful paste data in their attributes.
    .filter((b) => (b.element.textContent || '').trim() || !!ctx.router.findByTag(b.tag))

  if (extracted.length === 0) return

  const first = /** @type {import('./pasteUtils.js').ExtractedBlock} */ (extracted[0])
  const targetBlock = ctx.blocks.getCurrentBlock()

  // Single paragraph → inline insert into the current block.
  if (extracted.length === 1 && first.tag === 'p') {
    const sanitized = sanitizeHtml(first.element.innerHTML)
    if (sanitized) insertHtmlAtCaret(sanitized)
    if (targetBlock) ctx.notifyChanged(targetBlock)
    else ctx.notifyChanged()
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

  if (firstIsTextLike && targetBlock) ctx.notifyChanged(targetBlock)
  else ctx.notifyChanged()
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
  const template = document.createElement('template')
  template.innerHTML = html
  const frag = template.content
  const lastNode = frag.lastChild
  range.insertNode(frag)
  if (lastNode) {
    range.setStartAfter(lastNode)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}
