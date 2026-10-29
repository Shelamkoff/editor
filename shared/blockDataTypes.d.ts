import type { EditorBlockData } from './documentTypes.js'

/** Canonical built-in payloads shared by editor schemas and read-only rendering. */
export interface ParagraphData {
    text: string
}

export interface HeadingData {
    text: string
    level: 2 | 3 | 4 | 5 | 6
}

export interface ListItem {
    id: string
    text: string
}

export interface ListData {
    style: 'ordered' | 'unordered'
    items: ListItem[]
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

export interface TableCell {
    id: string
    text: string
}

export interface TableRow {
    id: string
    cells: TableCell[]
}

export interface TableData {
    withHeadings?: boolean
    rows: TableRow[]
}

export interface ChecklistItem {
    id: string
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
    id: string
    url: string
    caption: string
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
    id: string
    url: string
    name: string
    size: number
    extension: string
}

export interface AttachesData {
    files: AttachesFile[]
    variant: 'a' | 'b' | 'f' | 'g'
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
    id: string
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

export interface PersonLink {
    id: string
    type: string
    url: string
}

export interface PersonItem {
    id: string
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

export type ParagraphBlock = EditorBlockData<'paragraph', ParagraphData>
export type HeadingBlock = EditorBlockData<'heading', HeadingData>
export type ListBlock = EditorBlockData<'list', ListData>
export type QuoteBlock = EditorBlockData<'quote', QuoteData>
export type CodeBlock = EditorBlockData<'code', CodeData>
export type ImageBlock = EditorBlockData<'image', ImageData>
export type DelimiterBlock = EditorBlockData<'delimiter', DelimiterData>
export type TableBlock = EditorBlockData<'table', TableData>
export type ChecklistBlock = EditorBlockData<'checklist', ChecklistData>
export type WarningBlock = EditorBlockData<'warning', WarningData>
export type EmbedBlock = EditorBlockData<'embed', EmbedData>
export type RawBlock = EditorBlockData<'raw', RawData>
export type GalleryBlock = EditorBlockData<'gallery', GalleryData>
export type CarouselBlock = EditorBlockData<'carousel', CarouselData>
export type AttachesBlock = EditorBlockData<'attaches', AttachesData>
export type LinkPreviewBlock = EditorBlockData<'linkPreview', LinkPreviewData>
export type ToggleBlock = EditorBlockData<'toggle', ToggleData>
export type ColumnsBlock = EditorBlockData<'columns', ColumnsData>
export type SpoilerBlock = EditorBlockData<'spoiler', SpoilerData>
export type PollBlock = EditorBlockData<'poll', PollData>
export type PersonBlock = EditorBlockData<'person', PersonData>

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
