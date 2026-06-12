/**
 * Hydrate inline plugin widgets inside a DOM root.
 * Finds all `[data-inline-plugin]` elements and calls the matching plugin's `hydrate()`.
 *
 * @param {HTMLElement} root
 * @param {import('./InlinePluginRegistry').InlinePluginRegistry} registry
 * @param {import('./types').InlinePluginContext} ctx
 */
export function hydrateInlinePlugins(root, registry, ctx) {
  if (!registry || registry.size === 0) return

  const widgets = root.querySelectorAll('[data-inline-plugin]')
  for (const widget of widgets) {
    const el = /** @type {HTMLElement} */ (widget)
    // Skip already hydrated widgets
    if (el.dataset.hydrated) continue

    const type = el.dataset.inlinePlugin
    if (!type) continue

    const plugin = registry.get(type)
    if (!plugin) {
      console.warn(`[hydrateInlinePlugins] Unknown inline plugin type: "${type}"`)
      continue
    }

    plugin.hydrate(el, ctx)
    el.dataset.hydrated = '1'
  }
}
