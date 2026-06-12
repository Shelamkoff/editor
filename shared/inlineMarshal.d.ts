import type { InlineWidget, InlinePluginLike } from '../renderer/types'

/**
 * Anything that can look up an inline plugin by its `type`. Satisfied by
 * both `InlinePluginRegistry` (editor-side) and a `Map<string, InlinePluginLike>`
 * (renderer-side).
 */
export interface PluginLookup {
  get(type: string): InlinePluginLike | undefined
}

/**
 * Generate a new inline widget instance id. Used when a widget is minted
 * programmatically without an incoming id — e.g. from a fresh commit path
 * that didn't set `data-id` on the DOM beforehand.
 */
export function generateInlineId(): string

/**
 * Replace committed inline-widget spans in `html` with `{{<id>}}` text
 * placeholders and collect their data into a block-level `inline` map.
 * The widget's own `data-id` attribute is used as the key (generated on
 * the fly for legacy widgets that lack one).
 */
export function serializeInlineHtml(
  html: string,
  registry: PluginLookup | null | undefined,
): { html: string; inline: Record<string, InlineWidget> }

/**
 * Expand `{{<id>}}` tokens back into widget DOM. For each token the
 * corresponding `inline[<id>]` entry is looked up and dispatched to
 * the plugin's `createWidget(data, id)`, preserving the widget's stable
 * instance id on the rebuilt span.
 */
export function deserializeInlineHtml(
  html: string,
  inline: Record<string, InlineWidget> | null | undefined,
  registry: PluginLookup | null | undefined,
): string
