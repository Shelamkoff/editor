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
export function insertInlinePluginAtCaret(registry: import("./InlinePluginRegistry").InlinePluginRegistry, ctx: import("./types").InlinePluginContext, events: import("./types").IEventBus, type: string, data?: Record<string, string>): void;
