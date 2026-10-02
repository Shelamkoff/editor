import type { InlinePluginDefinition } from '../../plugin-kit/types.js'

export interface MentionItem {
  id: string | number
  name: string
  avatar?: string
  details?: string
  [key: string]: unknown
}

export interface MentionSearchResult {
  items: MentionItem[]
  nextPageUrl?: string | null
}

export interface MentionSearchContext {
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
  trigger?: string
  searchFunction?: MentionSearchFunction | null
  debounceDelay?: number
  noResultsText?: string
  dropdownClass?: string
  onMentionSelect?: ((data: { id: string | number; name: string }) => void) | null
  renderItem?: MentionRenderItem | null
  renderNoResults?: MentionRenderNoResults | null
  renderLoading?: MentionRenderLoading | null
}

export interface MentionWidgetData extends Record<string, unknown> {
  id: string
  name: string
}

export function createMentionPlugin(
  options?: MentionPluginOptions,
): InlinePluginDefinition<MentionWidgetData>
