import type { InlinePlugin } from '../../core/types.js'
import type { InlineWidget, InlinePluginLike } from '../../renderer/types.js'

/**
 * A single search-result entry for the mention dropdown.
 * Mirrors the shape of `@shelamkoff/mentionjs` MentionItem so existing
 * call-sites can migrate with minimal changes.
 */
export interface MentionItem {
  id: string | number
  name: string
  /** Optional avatar URL. Falls back to an initials-filled placeholder. */
  avatar?: string
  /** Optional secondary line shown under the name. */
  details?: string
  /** Extra fields remain available to custom result renderers. They are not persisted or passed to `onMentionSelect`. */
  [key: string]: unknown
}

/**
 * Result of a single `searchFunction` call. Either a bare array of items
 * or an object with optional pagination cursor.
 */
export interface MentionSearchResult {
  items: MentionItem[]
  nextPageUrl?: string | null
}

export interface MentionSearchContext {
  /** Aborted when a newer query starts, the popup closes, or the plugin is destroyed. */
  signal: AbortSignal
}

export type MentionSearchFunction = (
  query: string,
  nextPageUrl: string | null,
  context: MentionSearchContext,
) => Promise<MentionSearchResult | MentionItem[]>

export type MentionRenderItem = (
  data: MentionItem,
  index: number,
  isActive: boolean,
) => HTMLElement | null | undefined

export type MentionRenderNoResults = (
  noResultsText: string,
) => HTMLElement | null | undefined

export type MentionRenderLoading = () => HTMLElement | null | undefined

export interface MentionPluginOptions {
  /** Character that activates the dropdown. Default: '@'. */
  trigger?: string
  /** Async callback that returns suggestions for a query. Required. */
  searchFunction?: MentionSearchFunction | null
  /** Debounce window between keystroke and `searchFunction` call. */
  debounceDelay?: number
  /** Fallback text when no results match. Defaults to the i18n string. */
  noResultsText?: string
  /** Extra class appended to the dropdown root element. */
  dropdownClass?: string
  /** Fires when a user commits a mention (keyboard or click). */
  onMentionSelect?: ((data: { id: string | number; name: string }) => void) | null
  /** Custom renderer for list items. Return an HTMLElement or null to fall back. */
  renderItem?: MentionRenderItem | null
  /** Custom renderer for the no-results row. */
  renderNoResults?: MentionRenderNoResults | null
  /** Custom renderer for the loading row. */
  renderLoading?: MentionRenderLoading | null
}

/**
 * Factory: build a mention inline plugin suitable for `createEditor({ inlinePlugins: [...] })`.
 *
 * The plugin listens for the trigger character (default `@`) via the editor's
 * built-in `TriggerManager`, opens a searchable dropdown, and commits the
 * selected user as a Rector inline widget:
 *
 *   <span data-inline-plugin="mention" data-value="<id>"
 *         class="oe-ip oe-ip--mention">@Name</span>
 *
 * The widget survives paragraph save/render via the shared sanitize allowlist,
 * and is restored by the document renderer using the same widget contract.
 */
export function createMentionPlugin(options?: MentionPluginOptions): InlinePlugin

/**
 * The `data` shape carried in `InlineWidget<'mention'>.data` — the
 * plugin-specific payload written during save and read during load.
 *
 * `id`   — the committed user id (mirrors `data-value` on the span).
 * `name` — display name, WITHOUT the trigger character (marshal strips `@`).
 */
export interface MentionWidgetData extends Record<string, unknown> {
  id: string
  name: string
}

/** Concrete inline widget type produced by mention saves. */
export type MentionWidget = InlineWidget<'mention', MentionWidgetData>

/**
 * Renderer-side mention widget — just `createWidget` + `getData` + `type`.
 * Pass to `RendererConfig.inlinePlugins` so the renderer can rehydrate
 * mention placeholders into their display pills without dragging in the
 * full editor runtime (dropdown UI, trigger manager, search pipeline).
 */
export function createMentionWidget(): InlinePluginLike
