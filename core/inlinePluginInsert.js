/**
 * Insert an inline plugin widget at the current native caret position.
 *
 * Extracted from EditorFacade to keep DOM manipulation out of the facade.
 *
 * @param {import('./InlinePluginRegistry').InlinePluginRegistry} registry
 * @param {import('./types').InlinePluginContext} ctx
 * @param {string} type
 * @param {Record<string, string>} [data]
 * @param {HTMLElement} [rootEl]
 * @returns {boolean} whether editor DOM was changed
 */
export function insertInlinePluginAtCaret(registry, ctx, type, data = {}, rootEl) {
  const plugin = registry.get(type)
  if (!plugin) {
    console.warn(`[insertInlinePlugin] Unknown inline plugin type: "${type}"`)
    return false
  }

  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return false
  const range = sel.getRangeAt(0)
  if (rootEl && !rootEl.contains(range.commonAncestorContainer)) return false

  // Plugins can opt out of the default "create a committed widget at caret"
  // flow by implementing `insertFresh` — e.g. the mention plugin uses this
  // to insert just the `@` trigger character, letting its onEdit pipeline
  // open the dropdown naturally (same UX as typing `@` manually).
  if (typeof plugin.insertFresh === 'function') {
    plugin.insertFresh(ctx)
    return true
  }

  const widget = plugin.createWidget(data)
  if (!(widget instanceof HTMLElement)) {
    throw new TypeError(`Inline plugin "${type}" createWidget() must return an HTMLElement`)
  }
  plugin.hydrate(widget, ctx)
  widget.dataset.hydrated = '1'

  range.deleteContents()
  range.insertNode(widget)

  // Insert a space after widget so caret has somewhere to go
  const space = document.createTextNode('\u00A0')
  widget.after(space)

  // Place caret after the space
  const newRange = document.createRange()
  newRange.setStartAfter(space)
  newRange.collapse(true)
  sel.removeAllRanges()
  sel.addRange(newRange)

  return true
}
