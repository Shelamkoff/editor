import type {
    EditorBlockData,
    EditorInlineWidget,
    EditorOutputData,
} from '../shared/documentTypes.js'
import type { LocaleValue } from '../shared/localeTypes.js'
export type { LocaleValue, PluralForms } from '../shared/localeTypes.js'

/**
 * Renderer input data. Compatible with EditorDocument from the editor core —
 * the renderer accepts any editor output as-is. Fields are optional because
 * the renderer only needs `blocks`; callers may omit metadata.
 */
export interface OutputData extends EditorOutputData<OutputBlockData> {
    time?: number
    version?: string
    blocks: OutputBlockData[]
}

/**
 * Single block for rendering. Unlike core BlockData, `id` and `tunes` are
 * optional because the renderer does not require them.
 *
 * Text-carrying blocks (paragraph, heading, list, quote, checklist, …) may
 * carry an `inline` map keyed by widget instance ids. Each entry describes
 * a single inline widget (mention, color swatch, …) that was embedded in
 * one of the block's text fields. Placeholder markup in the text field is
 * a plain text token: `{{<id>}}`. The renderer / editor rehydrates real
 * widget DOM from `inline[<id>]` via the registered inline plugin's
 * `createWidget(data, id)`, passing the id through so the widget preserves
 * its stable identity across save / load round-trips.
 */
export interface OutputBlockData<
    Type extends string = string,
    Data extends object = object
> extends EditorBlockData<Type, Data> {
    id?: string
    type: Type
    data: Data
    inline?: Record<string, InlineWidget>
}

/**
 * Opaque reference to a committed inline widget — its plugin type (so the
 * runtime can dispatch to the right `InlinePlugin.createWidget`) plus an
 * arbitrary, plugin-specific `data` payload. Parallels `OutputBlockData<T, D>`.
 *
 * Concrete inline plugins declare their own `Data` shape:
 * ```ts
 * type MentionWidget = InlineWidget<'mention', { id: string, name: string }>
 * type ColorWidget   = InlineWidget<'color',   { value: string }>
 * ```
 */
export interface InlineWidget<
    Type extends string = string,
    Data extends Record<string, unknown> = Record<string, unknown>
> extends EditorInlineWidget<Type, Data> {}

// ── Block Data Types ────────────────────────────────────────────────────────

export interface ParagraphData {
    text: string
    align?: 'left' | 'center' | 'right' | 'justify'
}

export interface HeadingData {
    text: string
    level: 2 | 3 | 4 | 5 | 6
    align?: 'left' | 'center' | 'right'
}

export interface ListData {
    style: 'ordered' | 'unordered'
    items: string[]
}

export interface QuoteData {
    text: string
    caption: string
}

export interface CodeData {
    code: string
    language?: string
}

export interface ImageFile {
    url: string
    width?: number
    height?: number
}

export interface ImageStyles {
    backgroundColor?: string
    maxHeight?: string
    minHeight?: string
    maxWidth?: string
    minWidth?: string
    height?: string
    width?: string
    objectFit?: string
    objectPosition?: string
    borderStyle?: string
    borderColor?: string
    borderWidth?: string
    borderRadius?: string
}

export interface ImageData {
    file: ImageFile
    caption?: string
    withBorder?: boolean
    expanded?: boolean
    withBackground?: boolean
    styles?: ImageStyles
}

export interface DelimiterData {}

export interface TableData {
    withHeadings?: boolean
    content: string[][]
}

export interface ChecklistItem {
    text: string
    checked: boolean
}

export interface ChecklistData {
    items: ChecklistItem[]
}

export interface WarningData {
    title: string
    message: string
}

export interface EmbedData {
    service: string
    videoId: string
    caption?: string
    cover?: string
    title?: string
    duration?: string
}

export interface RawData {
    html: string
}

export interface GalleryImage {
    url: string
    caption?: string
}

export type GalleryLayout =
  | 'auto'
  | '1' | '2'
  | '3a' | '3b' | '3c'
  | '4a' | '4b' | '4c'
  | '5a' | '5b' | '5c'
  | '6a' | '6b' | '6c'
  | 'triptych'
  | 'masonry'
  | 'poly-5' | 'poly-3arch' | 'poly-5flat' | 'poly-3steps'

export interface GalleryStyles {
    gap?: string
    borderRadius?: string
    height?: string
}

export interface GalleryOptions {
    loop?: boolean
    zoom?: boolean
    navigation?: boolean
    captions?: boolean
    thumbnails?: boolean
    fullscreen?: boolean
    autoplayInterval?: number
}

export interface GalleryData {
    images: GalleryImage[]
    layout: GalleryLayout
    styles?: GalleryStyles
    options?: GalleryOptions
}

export interface CarouselSlide {
    id: string
    type: 'image' | 'video' | 'html'
    src?: string
    alt?: string
    caption?: string
    poster?: string
    html?: string
}

export interface CarouselOptions {
    loop: boolean
    autoplay: boolean
    autoplayDelay: number
    navigation: boolean
    pagination: boolean
    thumbnails: boolean
    aspectRatio?: string
}

export interface CarouselData extends Record<string, unknown> {
    slides: CarouselSlide[]
    options: CarouselOptions
}

export interface AttachesFile {
    url: string
    name: string
    size: number
    extension: string
}

export interface AttachesData {
    /** Multi-file format (current) */
    files?: AttachesFile[]
    /** Legacy single-file format */
    file?: AttachesFile
    variant?: 'a' | 'b' | 'f' | 'g'
}

export type LinkPreviewTemplate = 'horizontal' | 'compact' | 'large-top' | 'minimal' | 'twitter' | 'notion' | 'split'

export interface LinkPreviewData {
    url: string
    title: string
    description: string
    image: string
    favicon: string
    domain: string
    template?: LinkPreviewTemplate
}

export interface ToggleData {
    title: string
    content: string
    open?: boolean
}

export interface ColumnItem {
    content: string
}

export interface ColumnsData {
    columns: ColumnItem[]
    layout: '1-1' | '1-2' | '2-1' | '1-1-1'
}

export interface SpoilerData {
    label: string
    content: string
}

export interface PollOption {
    /** Stable document identity used by result snapshots and vote submissions. */
    id: string
    /** Inline-markup label displayed to the reader. */
    text: string
}

export interface PollOptionResult {
    /** Id of one current author-owned option. */
    id: string
    /** Non-negative integer number of ballots that selected this option. */
    votes: number
}

export interface PollVoter {
    /** Stable application-owned voter identity. */
    id: string
    name?: string
    /** Avatar URL accepted by the renderer media policy. */
    avatar?: string
    /** Current option ids attributed to this voter. */
    optionIds?: string[]
}

export interface PollResults {
    /** Optional opaque server revision used to reject stale snapshots. */
    revision?: string
    /** Non-negative integer ballot count and percentage denominator. */
    total: number
    /** Exactly one result for every current poll option. */
    options: PollOptionResult[]
    /** Optional bounded voter summaries. */
    voters?: PollVoter[]
    /** Total voter count when `voters` contains only a bounded subset. */
    votersTotal?: number
    /** Complete selection of the current application user. */
    currentUserVote?: string[]
}

export interface PollData extends Record<string, unknown> {
    pollId?: string
    question: string
    type: 'single' | 'multiple'
    options: PollOption[]
    resultsMode: 'always' | 'afterVote' | 'hidden'
    initialResults?: PollResults
}

export interface PollDataSource {
    /** Load the first authoritative result snapshot. */
    load(context: { pollId: string; signal: AbortSignal }): Promise<PollResults>
    /** Submit the complete current selection and return an authoritative snapshot. */
    vote(context: { pollId: string; optionIds: string[]; revision?: string; signal: AbortSignal }): Promise<PollResults>
    /** Subscribe to later authoritative snapshots and optionally return idempotent cleanup. */
    subscribe?(context: {
        pollId: string
        signal: AbortSignal
        onUpdate(results: PollResults): void
        onError(error: unknown): void
    }): void | (() => void)
}

export interface PollRendererConfig {
    /** Optional server-owned result adapter; local voting is used when omitted. */
    dataSource?: PollDataSource
    /** Observes adapter, cleanup, and revision-comparator errors. */
    onError?: (error: unknown) => void
    /** Maximum retained voter records; defaults to 50. */
    maxVoters?: number
    /** Orders opaque revisions; a positive result accepts `next` as newer. */
    compareRevisions?: (next: string, current: string) => number
}

export interface PersonLink {
    type: string
    url: string
}

export interface PersonItem {
    avatar: string
    name: string
    role: string
    bio: string
    links: PersonLink[]
}

export interface PersonData {
    persons: PersonItem[]
}

// ── Block Type Aliases ──────────────────────────────────────────────────────

export type ParagraphBlock = OutputBlockData<'paragraph', ParagraphData>
export type HeadingBlock = OutputBlockData<'heading', HeadingData>
export type ListBlock = OutputBlockData<'list', ListData>
export type QuoteBlock = OutputBlockData<'quote', QuoteData>
export type CodeBlock = OutputBlockData<'code', CodeData>
export type ImageBlock = OutputBlockData<'image', ImageData>
export type DelimiterBlock = OutputBlockData<'delimiter', DelimiterData>
export type TableBlock = OutputBlockData<'table', TableData>
export type ChecklistBlock = OutputBlockData<'checklist', ChecklistData>
export type WarningBlock = OutputBlockData<'warning', WarningData>
export type EmbedBlock = OutputBlockData<'embed', EmbedData>
export type RawBlock = OutputBlockData<'raw', RawData>
export type GalleryBlock = OutputBlockData<'gallery', GalleryData>
export type CarouselBlock = OutputBlockData<'carousel', CarouselData>
export type AttachesBlock = OutputBlockData<'attaches', AttachesData>
export type LinkPreviewBlock = OutputBlockData<'linkPreview', LinkPreviewData>
export type ToggleBlock = OutputBlockData<'toggle', ToggleData>
export type ColumnsBlock = OutputBlockData<'columns', ColumnsData>
export type SpoilerBlock = OutputBlockData<'spoiler', SpoilerData>
export type PollBlock = OutputBlockData<'poll', PollData>
export type PersonBlock = OutputBlockData<'person', PersonData>

export type Block =
    | ParagraphBlock
    | HeadingBlock
    | ListBlock
    | QuoteBlock
    | CodeBlock
    | ImageBlock
    | DelimiterBlock
    | TableBlock
    | ChecklistBlock
    | WarningBlock
    | EmbedBlock
    | RawBlock
    | GalleryBlock
    | CarouselBlock
    | AttachesBlock
    | LinkPreviewBlock
    | ToggleBlock
    | ColumnsBlock
    | SpoilerBlock
    | PollBlock
    | PersonBlock

export type BlockType = Block['type']

// ── Renderer Interfaces ─────────────────────────────────────────────────────

export type InlineParser = (text: string) => DocumentFragment

export interface BlockRenderer<T extends OutputBlockData = OutputBlockData> {
    type: T['type']
    styles?: string[]
    render(block: T, parseInline: InlineParser): HTMLElement
    /** Release observers, global listeners, and third-party instances. */
    destroy?(element: HTMLElement): void
    /**
     * Symmetric with `BlockPlugin.mapTextFields`. Walk the block's
     * HTML-bearing fields and apply `transform` to each. The renderer
     * pipeline calls this to expand `{{<id>}}` placeholder tokens into
     * full widget DOM before invoking `render`. Omit for non-text blocks.
     */
    mapTextFields?(data: T['data'], transform: (html: string) => string): void
}

export interface RendererConfig {
    /** Namespace used by generated renderer classes. Default: 'editor'. */
    classPrefix?: string
    /** Throw for an unregistered block instead of rendering a placeholder. Default: true. */
    throwOnUnknown?: boolean
    /** Theme for the rendered output. Default: 'dark'. */
    theme?: 'dark' | 'light'
    /** Validate built-in block data before rendering. Default: 'preserve'. */
    validationMode?: 'preserve' | 'strict'
    /** Content-free notification for malformed built-in block data. */
    onValidationError?: (issue: { blockId?: string; type: string }) => void
    /** Flat locale dictionary for renderer strings. Keys use `renderer.*` prefix. */
    locale?: Record<string, LocaleValue>
    /** Default renderers to construct. Omit to keep the complete public preset. */
    blockTypes?: BlockType[]
    /** Per-built-in-renderer runtime configuration. */
    blockConfigs?: {
        poll?: PollRendererConfig
        [type: string]: unknown
    }
    /**
     * Inline plugins the renderer should use when rehydrating inline widget
     * placeholder tokens (`{{<id>}}`). Read-only rendering only needs each
     * plugin's `createWidget` + `getData` — see `createMentionWidget()`
     * for a lightweight factory suitable here.
     */
    inlinePlugins?: InlinePluginLike[]
}

/**
 * Minimal contract for inline widget rehydration on the renderer side.
 * Structurally a subset of the editor-side `InlinePlugin` (core types) —
 * defined here so the renderer package does not depend on editor runtime.
 *
 * `createWidget(data, id)` — when `id` is provided, the widget MUST set
 * `data-id="<id>"` on its root element so the id survives the next save
 * round-trip. When omitted (fresh programmatic insertion), the factory
 * generates one itself.
 */
export interface InlinePluginLike {
    readonly type: string
    createWidget(data: Record<string, unknown>, id?: string): HTMLElement
    getData(element: HTMLElement): Record<string, unknown>
}
