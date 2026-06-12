/**
 * Hydrate inline plugin widgets inside a DOM root.
 * Finds all `[data-inline-plugin]` elements and calls the matching plugin's `hydrate()`.
 *
 * @param {HTMLElement} root
 * @param {import('./InlinePluginRegistry').InlinePluginRegistry} registry
 * @param {import('./types').InlinePluginContext} ctx
 */
export function hydrateInlinePlugins(root: HTMLElement, registry: import("./InlinePluginRegistry").InlinePluginRegistry, ctx: import("./types").InlinePluginContext): void;
