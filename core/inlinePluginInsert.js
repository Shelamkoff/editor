import { EditorEvent } from './editorEvents.js'

/**
 * Insert an inline plugin widget at the current native caret position.
 *
 * Extracted from EditorFacade to keep DOM manipulation out of the facade.
 *
 * @param {import('./InlinePluginRegistry').InlinePluginRegistry} registry
 * @param {import('./types').InlinePluginContext} ctx
 * @param {import('./types').IEventBus} events
 * @param {string} type
 * @param {Record<string, string>} [data]
 */
export function insertInlinePluginAtCaret(registry, ctx, events, type, data = {}) {
  const plugin = registry.get(type)
  if (!plugin) {
    console.warn(`[insertInlinePlugin] Unknown inline plugin type: "${type}"`)
    return
  }

  // Plugins can opt out of the default "create a committed widget at caret"
  // flow by implementing `insertFresh` — e.g. the mention plugin uses this
  // to insert just the `@` trigger character, letting its onEdit pipeline
  // open the dropdown naturally (same UX as typing `@` manually).
  if (typeof plugin.insertFresh === 'function') {
    plugin.insertFresh(ctx)
    events.emit(EditorEvent.CHANGED)
    return
  }

  const widget = plugin.createWidget(data)
  plugin.hydrate(widget, ctx)
  widget.dataset.hydrated = '1'

  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return

  const range = sel.getRangeAt(0)
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

  events.emit(EditorEvent.CHANGED)
}
