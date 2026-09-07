import { takePasteTail, finishBlockPaste } from './pasteTail.js'
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
  // Treat CRLF as one boundary and standalone CR as a newline, before
  // applying the existing policy of omitting empty lines.
  const nonEmpty = preparePlainText(text)
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

  const tail = takePasteTail(targetBlock)
  insertTextOrReplace(/** @type {string} */ (nonEmpty[0]), ctx.blocks)

  const currentIndex = ctx.blocks.getCurrentIndex()
  let insertIndex = currentIndex + 1

  for (let i = 1; i < nonEmpty.length; i++) {
    const escaped = /** @type {string} */ (nonEmpty[i])
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    ctx.blocks.insert(ctx.defaultBlockType, { text: escaped }, insertIndex, undefined, undefined, tail?.metadata.tunes)
    insertIndex++
  }

  // Focus the last inserted block once (avoid intermediate focus shifts).
  const lastBlock = ctx.blocks.getBlockByIndex(insertIndex - 1)
  finishBlockPaste(lastBlock, tail, true, ctx)

  if (targetBlock) ctx.notifyChanged(targetBlock)
  else ctx.notifyChanged()
}

/** @param {string} text @returns {string[]} */
export function preparePlainText(text) {
  return text.split(/\r\n?|\n/).filter(line => line.length > 0)
}

/** @typedef {{ tag: string, type: string, data: Record<string, unknown>, routed: boolean }} PreparedHtml */

/** Parse and sanitize before any selected content is removed. Plugin paste
 * handlers run exactly once, while their returned data is still staged.
 * @param {string} html
 * @param {Pick<InsertContext, 'router' | 'defaultBlockType'>} ctx
 * @returns {PreparedHtml[]}
 */
export function prepareHtmlPaste(html, ctx) {
  const template = document.createElement('template')
  template.innerHTML = html
  const extracted = extractBlockElements(template.content, tag => !!ctx.router.findByTag(tag))
  const prepared = []
  for (const item of extracted) {
    const plugin = ctx.router.findByTag(item.tag)
    if (!(item.element.textContent || '').trim() && !plugin) continue
    if (plugin?.onPaste && item.tag !== 'p' && item.tag !== 'div') {
      const data = plugin.onPaste({ type: 'tag', element: item.element, tag: item.tag })
      if (data) {
        prepared.push({ tag: item.tag, type: plugin.type, data, routed: true })
        continue
      }
    }
    const text = sanitizeHtml(item.element.innerHTML)
    if (text) prepared.push({ tag: item.tag, type: ctx.defaultBlockType, data: { text }, routed: false })
  }
  return prepared
}

/** @param {string} html @param {InsertContext} ctx */
export function pasteHtml(html, ctx) {
  pastePreparedHtml(prepareHtmlPaste(html, ctx), ctx)
}

/** Apply a nonempty, prepared HTML sequence inside the clipboard transaction.
 * @param {PreparedHtml[]} prepared
 * @param {InsertContext} ctx
 */
export function pastePreparedHtml(prepared, ctx) {
  if (!prepared.length) return
  const first = prepared[0]
  const targetBlock = ctx.blocks.getCurrentBlock()
  const textLike = item => !item.routed && (item.tag === 'p' || item.tag === 'div')
  if (prepared.length === 1 && textLike(first)) {
    insertHtmlAtCaret(String(first.data.text))
    if (targetBlock) ctx.notifyChanged(targetBlock)
    else ctx.notifyChanged()
    return
  }
  const currentIndex = ctx.blocks.getCurrentIndex()
  const tail = takePasteTail(targetBlock)
  let insertIndex = currentIndex + 1
  const insert = item => ctx.blocks.insert(
    item.type, item.data, insertIndex++, undefined, undefined,
    item.routed ? undefined : tail?.metadata.tunes,
  )
  if (textLike(first)) insertHtmlAtCaret(String(first.data.text))
  else insert(first)
  for (const item of prepared.slice(1)) insert(item)
  const lastBlock = ctx.blocks.getBlockByIndex(insertIndex - 1)
  finishBlockPaste(lastBlock, tail, textLike(prepared.at(-1)), ctx)
  if (targetBlock) ctx.notifyChanged(targetBlock)
  else ctx.notifyChanged()
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
