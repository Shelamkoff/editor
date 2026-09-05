/** Live ownership cannot be inferred from serialized data-hydrated markup. */
const hydratedWidgets = new WeakMap()

/**
 * @param {HTMLElement} element
 * @param {import('./types').InlinePlugin} plugin
 * @param {import('./types').InlinePluginContext} ctx
 */
export function hydrateInlineWidget(element, plugin, ctx) {
  const previous = hydratedWidgets.get(element)
  if (previous?.plugin === plugin && previous.ctx === ctx) return
  plugin.hydrate(element, ctx)
  hydratedWidgets.set(element, { plugin, ctx })
  element.dataset.hydrated = '1'
}

/**
 * Hydrate inline plugin widgets inside a DOM root.
 * Finds all `[data-inline-plugin]` elements and calls the matching plugin's `hydrate()`.
 *
 * @param {HTMLElement} root
 * @param {import('./types').IInlinePluginRegistry} registry
 * @param {import('./types').InlinePluginContext} ctx
 */
export function hydrateInlinePlugins(root, registry, ctx) {
  if (!registry || registry.size === 0) return

  const widgets = root.querySelectorAll('[data-inline-plugin]')
  for (const widget of widgets) {
    const el = /** @type {HTMLElement} */ (widget)
    const type = el.dataset.inlinePlugin
    if (!type) continue

    const plugin = registry.get(type)
    if (!plugin) {
      console.warn(`[hydrateInlinePlugins] Unknown inline plugin type: "${type}"`)
      continue
    }

    try {
      hydrateInlineWidget(el, plugin, ctx)
    } catch (err) {
      // One malformed third-party widget must not prevent the rest of a
      // document from rendering or hydrating.
      console.warn(`[hydrateInlinePlugins] Failed to hydrate "${type}":`, err)
    }
  }
}
