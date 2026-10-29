import type { EditorBlockData } from '../shared/documentTypes.js'
import type { BlockType, PollResults } from '../shared/blockDataTypes.js'
import type { LocaleValue } from '../shared/localeTypes.js'
import type { BlockDataSchema, InlineWidgetSchema } from '../plugin-kit/types.js'
export type { LocaleValue, PluralForms } from '../shared/localeTypes.js'

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
    onError?: (error: unknown) => void | Promise<void>
    /** Maximum retained voter records; defaults to 50. */
    maxVoters?: number
    /** Orders opaque revisions; a positive result accepts `next` as newer. */
    compareRevisions?: (next: string, current: string) => number
}

// ── Renderer Interfaces ─────────────────────────────────────────────────────

export type InlineParser = (text: string) => DocumentFragment

export interface RendererContext {
    /** Document that owns the render target and all DOM created for it. */
    readonly ownerDocument: Document
}

export interface BlockRenderer<T extends EditorBlockData = EditorBlockData> {
    type: T['type']
    styles?: string[]
    render(block: T, parseInline: InlineParser, context?: RendererContext): HTMLElement
    /** Release observers, global listeners, and third-party instances. */
    destroy?(element: HTMLElement): void
}

/** Public renderer registration bound to the same canonical schema as editing. */
export interface BlockRendererDefinition<T extends EditorBlockData = EditorBlockData>
    extends BlockRenderer<T> {
    readonly schema: BlockDataSchema<any>
}

export interface RendererConfig {
    /** Automatically load base and registered-renderer styles on first render. Default: true. */
    injectStyles?: boolean
    /** Namespace used by generated renderer classes. Default: 'editor'. */
    classPrefix?: string
    /** Throw for an unregistered block instead of rendering a placeholder. Default: true. */
    throwOnUnknown?: boolean
    /** Theme for the rendered output. Default: 'dark'. */
    theme?: 'dark' | 'light'
    /** Content-free notification for malformed built-in block data. */
    onValidationError?: (issue: import('../shared/documentTypes.js').DocumentValidationIssue & {
        readonly type: string
    }) => void | Promise<void>
    /** Flat locale dictionary for renderer strings. Keys use `renderer.*` prefix. */
    locale?: Record<string, LocaleValue>
    /** Default renderers to construct. Omit to keep the complete public preset. */
    blockTypes?: BlockType[]
    /** Per-built-in-renderer runtime configuration. */
    blockConfigs?: {
        poll?: PollRendererConfig
        [type: string]: unknown
    }
    /** Read-only inline widget renderers used to project canonical inline records. */
    inlineRenderers?: InlineWidgetRenderer[]
}

/** Read-only projection contract for one canonical inline-widget type. */
export interface InlineWidgetRenderer<
    Data extends object = object
> {
    readonly type: string
    readonly styles?: readonly string[]
    readonly schema: InlineWidgetSchema<Data>
    render(id: string, data: Readonly<Data>, context: { readonly ownerDocument: Document }): HTMLElement
}
