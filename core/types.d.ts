import type {
  EditorBlockData,
  EditorInlineWidget,
  EditorOutputData,
} from '../shared/documentTypes.js'
import type { LocaleValue } from '../shared/localeTypes.js'
export type { LocaleValue, PluralForms } from '../shared/localeTypes.js'

/** Explicit DOM aliases used by JavaScript JSDoc without colliding with Node.js types. */
export type DOMNode = Node
export type DOMText = Text

export interface EditorDocument extends EditorOutputData<BlockData> {
  time?: number
  version: string
  blocks: BlockData[]
}

export interface BlockData<
  T extends string = string,
  D extends Record<string, unknown> = Record<string, unknown>
> extends EditorBlockData<T, D> {
  id: string
  type: T
  data: D
  revision?: string | number
  tunes?: Record<string, unknown>
  /**
   * Inline widget map for text-carrying blocks. Populated by the editor's
   * save pipeline when `data` contains `{{<id>}}` placeholder tokens.
   * Each entry is `{ type, data }` — the inline plugin used to build the
   * widget plus the plugin-specific data captured from its DOM. The map
   * key is the widget's stable instance id (the same value that appears
   * inside `{{...}}` in the text and as `data-id` on the live widget).
   */
  inline?: Record<string, EditorInlineWidget>
}

// ── Plugin API ───────────────────────────────────────────────────────────────

/** Shared base for all plugin types (block plugins, inline widget plugins). */
export interface BasePlugin {
  readonly type: string
  readonly title: string
  readonly icon: string
  /** Locale metadata for composition roots that aggregate dictionaries. */
  readonly locale?: Record<string, Record<string, LocaleValue>>
  /** Receive i18n instance for localized titles, labels, and placeholders. */
  setI18n?(i18n: { t(key: string): string }): void
}

/**
 * Block plugin interface.
 *
 * Required: type, title, icon, render(), save().
 * Everything else is opt-in — the editor checks for each capability
 * at runtime via `typeof plugin.method === 'function'`.
 * `BlockPluginAbstract` provides a convenient base class with i18n support.
 */
export interface BlockPlugin<D extends Record<string, unknown> = Record<string, unknown>> extends BasePlugin {
  readonly inlineTools?: boolean | string[]

  /** Return the immutable constructor options owned by this plugin instance. */
  getPluginConfig?(): PluginRuntimeConfig
  /** Override the empty-state prompt of the default text block. */
  setPlaceholder?(placeholder: string): void

  // ── Core (required) ──────────────────────────────────────────────────────
  render(data: D, context: BlockMutationContext): HTMLElement
  save(element: HTMLElement): D

  // ── Lifecycle ────────────────────────────────────────────────────────────
  validate?(data: D): boolean
  /** Release resources shared by all mounted blocks when the editor is destroyed. */
  dispose?(): void
  /** Release resources owned by one rendered block. */
  destroy?(element: HTMLElement): void
  isEmpty?(element: HTMLElement): boolean

  // ── Toolbox & shortcuts ──────────────────────────────────────────────────
  toolbox?: ToolboxEntry | ToolboxEntry[]
  shortcuts?: ShortcutEntry[]

  // ── Merge ────────────────────────────────────────────────────────────────
  merge?(element: HTMLElement, data: D): void

  // ── Settings UI ──────────────────────────────────────────────────────────
  renderSettings?(element: HTMLElement): HTMLElement | HTMLElement[] | null
  changeLevel?(element: HTMLElement, level: number): HTMLElement
  onSettingsAction?(element: HTMLElement, action: string): Record<string, unknown> | null

  // ── Paste ────────────────────────────────────────────────────────────────
  pasteConfig?: PasteConfig
  onPaste?(event: PasteEvent): D | null
  /** Wait for asynchronous state created by a paste before committing history. */
  waitForPaste?(element: HTMLElement): Promise<void>

  // ── Conversion ───────────────────────────────────────────────────────────
  /**
   * Return neutral fields that can initialize another block type during a
   * conversion. This is not a search-index hook: preserve meaningful text and
   * safe inline HTML under conventional keys such as `text` where possible.
   */
  exportData?(element: HTMLElement): Record<string, unknown>
  /**
   * Describe a partial selection using plugin-owned data boundaries.
   * The method must not mutate `element`. The core replaces the source with
   * `remainingData` and creates the target block from `selectedData`. A plugin
   * whose root is not itself `contenteditable="true"` must implement this
   * method to support partial conversion; the generic HTML splitter is used
   * only for a single editable root that serializes to `{ text }`.
   */
  splitSelection?(element: HTMLElement, range: Range): {
    remainingData: D | null
    selectedData: Record<string, unknown>
  } | null

  // ── Inline toolbar controls ──────────────────────────────────────────────
  renderInlineControls?(contentElement: HTMLElement, ctx: InlineControlContext): InlineControlGroup | null

  // ── Inline widget marshalling (text blocks only) ─────────────────────────
  /**
   * Walk every HTML-bearing field in `data` and apply `transform` to each.
   * The core calls this before `render(data)` (to rehydrate placeholder
   * tokens back into widget DOM) and after `save(element)` (to replace
   * committed widget spans with placeholder refs while the core collects
   * an `inline` widget map at the block level).
   *
   * Implement on every block that enables inline tools and stores HTML,
   * including structured blocks with several text fields. Media-only blocks
   * should leave this undefined; the core then skips widget marshalling.
   *
   * `transform` is opaque to the plugin: it hides the tokenize / rehydrate
   * mechanism and the widget registry entirely. The plugin only knows its
   * own data shape and where text lives in it.
   */
  mapTextFields?(data: D, transform: (html: string) => string): void
}

/** Runtime services available to a block plugin's interactive handlers. */
export interface BlockMutationContext {
  /** Execute one synchronous block-local command as one undo/redo step. */
  mutate<T>(operation: () => T): T | undefined
  /** Split the current block through the core structural command pipeline. */
  splitBlock(): void
  /** Convert the current empty non-default block to the default block type. */
  exitEmptyBlock(): boolean
  /**
   * True when document mutations and application side effects are forbidden.
   * A presentation-only button may remain enabled by adding
   * `data-oe-read-only-interactive` to that control.
   */
  readonly readOnly: boolean
}

/** Common runtime options consumed by the editor composition root. */
export interface PluginRuntimeConfig extends Record<string, unknown> {
  /** Disable automatic injection of the plugin constructor's `styles` URLs. */
  injectStyles?: boolean
  /** Additional stylesheet URL injected after the plugin's default styles. */
  css?: string
}

/** Static properties on block plugin constructors. */
export interface BlockPluginConstructor<D extends Record<string, unknown> = Record<string, unknown>> {
  new (): BlockPlugin<D>
  /** CSS stylesheet URLs injected via <link> tags. */
  styles?: string[]
  /** Locale messages per language, merged into i18n on registration. */
  locale?: Record<string, Record<string, LocaleValue>>
  /**
   * Whether this block accepts neutral rich text during conversion and can
   * participate in text-target cross-block conversion. This does not require
   * the plugin root itself to be contenteditable; structured text plugins use
   * `splitSelection()` to describe partial selections.
   */
  isTextBlock?: boolean
}

export interface InlineControlContext {
  /** Call before DOM swaps to prevent toolbar from hiding */
  suppressSelectionChange(): void
  /** Execute one synchronous block-local command as one undo/redo step. */
  mutate<T>(operation: () => T): T
  /** Call after DOM swap when contentElement was replaced (e.g. heading level change) */
  onContentElementChanged(newElement: HTMLElement): void
}

export interface InlineControlGroup {
  /** Elements to render in the plugin controls zone (plugin manages its own events) */
  elements: HTMLElement[]
  /** Called when plugin controls are removed from the toolbar */
  destroy?(): void
}

export interface ToolboxEntry {
  title: string
  icon: string
  data?: Record<string, unknown>
}

// ── Paste ────────────────────────────────────────────────────────────────────

export interface PasteConfig {
  /** HTML tags this plugin handles (e.g. ['pre', 'code'], ['h1', 'h2', 'h3']) */
  tags?: string[]
  /** MIME patterns for file paste (e.g. ['image/*', 'application/pdf']) */
  files?: string[]
  /** Regex patterns matched against plain text (e.g. URL detection) */
  patterns?: RegExp[]
}

export interface TagPasteEvent {
  type: 'tag'
  /** The original DOM element from parsed clipboard HTML */
  element: HTMLElement
  /** Lowercase tag name */
  tag: string
}

export interface FilePasteEvent {
  type: 'file'
  file: File
}

export interface PatternPasteEvent {
  type: 'pattern'
  /** The matched text */
  data: string
}

export type PasteEvent = TagPasteEvent | FilePasteEvent | PatternPasteEvent

// ── Shortcuts ────────────────────────────────────────────────────────────────

export interface ShortcutEntry {
  /** Normalized combo: 'Mod+Shift+1', 'Tab', 'Shift+Tab' */
  combo: string
  /** Handler receives the block's content element */
  handler: (contentElement: HTMLElement) => void
}

// ── Inline Tool ──────────────────────────────────────────────────────────────

export interface InlineTool {
  readonly type: string
  /** Human-readable title for tooltip (e.g. "Bold", "Italic"). Falls back to type. */
  readonly title?: string
  readonly icon: string
  readonly shortcut?: string
  readonly tag?: string

  isActive(selection: InlineSelection): boolean
  toggle(selection: InlineSelection): void
  /** Optional drill-down panel. Return null to signal toggle() should be called instead. */
  renderActions?(ctx: InlineToolActionContext): HTMLElement | null
  /** Dynamic icon - reflects current state (e.g. alignment direction, link toggle). */
  getIcon?(active: boolean): string
  /** Dynamic title for tooltip (e.g. current alignment name, link/unlink). */
  getTitle?(active: boolean): string
  /** Called after the tool button is mounted in the DOM. */
  onMount?(button: HTMLElement, mutations?: InlineMutationContext): void
  /** Whether the tool's dropdown is currently open (prevents toolbar from hiding). */
  isDropdownOpen?(): boolean
  destroy?(): void
}

export interface InlineMutationContext {
  /** Execute one synchronous range mutation as one undo/redo step. */
  mutate<T>(range: Range, operation: () => T): T
}

export interface InlineToolActionContext {
  /** Cloned selection range saved before opening the panel */
  range: Range
  /** Execute a mutation of the saved range as one undo/redo step. */
  mutate<T>(operation: () => T): T
  /** Restore the saved selection (call before applying changes) */
  restoreSelection(): void
  /** Close the actions panel and return to the buttons view */
  close(): void
  /** Show tooltip on an anchor element */
  showTooltip(anchor: HTMLElement, label: string): void
  /** Hide tooltip */
  hideTooltip(): void
}

// ── Selection ────────────────────────────────────────────────────────────────

export interface CaretPosition {
  blockId: string
  offset: number
}

export interface InlineSelection {
  blockId: string
  range: Range
  text: string
}

// ── Events ───────────────────────────────────────────────────────────────────

export interface EditorEvents {
  'block:added': { blockId: string; index: number }
  'block:removed': { blockId: string; index: number }
  'block:moved': { blockId: string; from: number; to: number }
  'block:converted': { blockId: string; from: string; to: string }
  'block:changed': { blockId: string }
  'block:focused': { blockId: string }
  'block:blurred': { blockId: string }
  'block:selected': { blockIds: string[] }
  'editor:ready': undefined
  'editor:willChange': undefined
  'editor:changed': undefined
  'history:commit': undefined
  'history:changed': { canUndo: boolean; canRedo: boolean }
  'readOnly:changed': { readOnly: boolean }
  'editor:destroyed': undefined
  'toolbar:opened': { type: 'block' | 'inline' }
  'toolbar:closed': { type: 'block' | 'inline' }
  'paste:applied': { startBlockId?: string; endBlockId?: string }
  'dragHandle:clicked': undefined
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface EditorTuning {
  /** Drag-and-drop — minimum pixel movement before mousedown becomes a drag. */
  drag: { threshold: number }
  /** Undo stack — max history depth and coalescing debounce. */
  undo: { maxStack: number, debounceMs: number }
  /** `onChange` coalescing window for ChangeNotifier. */
  change: { debounceMs: number }
  /** TypeSelector search — minimum plugin count before filter input appears. */
  toolbar: { filterThreshold: number }
  /** Block insert/move/remove animation durations (ms). */
  animations: { blockInsertMs: number, blockMoveMs: number, blockRemoveMs: number }
  /** Width below which the UI switches to mobile layout. Matches CSS media queries. */
  mobileBreakpoint: number
}

export interface BlockValidationIssue {
  blockId: string
  type: string
  data: Record<string, unknown>
}

/** One directed, synchronous document-format migration. */
export interface DocumentMigration {
  from: string
  to: string
  migrate(document: EditorDocument): EditorDocument
}

export type EditorDiagnosticCode =
  | 'command.failed'
  | 'command.slow'
  | 'paste.failed'
  | 'paste.slow'
  | 'migration.applied'
  | 'migration.failed'
  | 'migration.unavailable'
  | 'save.failed'
  | 'save.slow'
  | 'render.slow'
  | 'editor.create.failed'
  | 'cleanup.failed'

export interface DiagnosticThresholds {
  commandMs: number
  saveMs: number
  renderMs: number
  pasteMs: number
}

/** Content-free operational signal. No document/plugin payload is exposed. */
export interface EditorDiagnostic {
  code: EditorDiagnosticCode
  timestamp: number
  durationMs?: number
  operation?: string
  pluginType?: string
  blockType?: string
  fromVersion?: string
  toVersion?: string
  errorName?: string
}

export interface EditorConfig {
  holder: HTMLElement
  plugins: BlockPlugin[]
  /** Custom inline tools. String types filter defaults, objects are used as-is. If omitted, all defaults are used. */
  inlineTools?: Array<string | InlineTool>
  /** Inline plugins (widgets inside text: color swatch, mention, etc.) */
  inlinePlugins?: InlinePlugin[]
  data?: EditorDocument
  /** Ordered through `from`/`to` links before initial load and every render(). */
  migrations?: DocumentMigration[]
  /** Apply reachable migrations; strict also requires a complete path to the current version. */
  documentVersionPolicy?: 'preserve' | 'strict'
  readOnly?: boolean
  placeholder?: string
  autofocus?: boolean
  minHeight?: number
  defaultBlock?: string
  /** Full locale dictionary (core + all plugins). Pass the aggregated
   *  object from `locale/ru.js` etc. Defaults to built-in English.
   *  Include `__lang: 'ru'` key for automatic plural rule selection. */
  locale?: Record<string, LocaleValue>
  /** UX/behavior tuning knobs. Merged onto `DEFAULT_TUNING`. */
  tuning?: DeepPartial<EditorTuning>
  onChange?: (data: EditorDocument) => void
  onReady?: () => void
  /** Preserve invalid blocks by default; strict mode rejects save. */
  validationMode?: 'preserve' | 'strict'
  /** Receives validation diagnostics without changing the saved document. */
  onValidationError?: (issue: BlockValidationIssue) => void
  /** Opt-in, content-free operational diagnostics. Disabled when omitted. */
  onDiagnostic?: (diagnostic: EditorDiagnostic) => void
  /** Slow-operation thresholds; omitted values do not emit timing diagnostics. */
  diagnosticThresholds?: Partial<DiagnosticThresholds>
  theme?: string
}

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

// ── I18n ─────────────────────────────────────────────────────────────────────

import enLocale from './locale/en.js'

/**
 * CLDR plural categories. Locales declare which forms are populated based on
 * their language rules (e.g. English uses `one`/`other`, Russian uses
 * `one`/`few`/`many`).
 */
// The shared PluralForms type is re-exported above.

/**
 * A locale entry — either a plain string (with optional `{name}` placeholders)
 * or a plural-form object (selected by `i18n.plural(key, count)`).
 */
// The shared LocaleValue type is re-exported above.

/**
 * Built-in editor messages, auto-derived from the core English locale.
 * Includes only the keys defined in `core/locale/en.js`.
 * @internal
 */
type CoreMessages = { [K in keyof typeof enLocale]: LocaleValue }

/**
 * Translation message dictionary.
 *
 * Plugins extend this interface via TypeScript declaration merging,
 * deriving their keys from their own `locale/en.js` file. Each plugin
 * keeps a `locale/keys.d.ts` file alongside its locale data.
 *
 * **Type-safety is best-effort**, not strict — the union of `MessageKey` is
 * built at compile time from declaration-merged plugins, but the runtime
 * dictionary contains only the plugins actually passed to `createEditor`.
 * `i18n.t()` accepts both known `MessageKey` values (for autocomplete) and
 * arbitrary `string` (for forward compatibility), and emits a runtime warning
 * when a key is missing.
 *
 * @example
 * // core/plugins/myPlugin/locale/keys.d.ts
 * import enLocale from './en.js'
 * declare module '../../../types' {
 *   interface I18nMessages extends Record<keyof typeof enLocale, LocaleValue> {}
 * }
 */
export interface I18nMessages extends CoreMessages {}

/** Union of all known message keys (core + every loaded plugin). */
export type MessageKey = keyof I18nMessages

/**
 * Plugin-facing i18n surface — auto-prefixes every key with the plugin's
 * namespace. Backward-compatible with full keys (passed through untouched).
 */
export interface IScopedI18n {
  t(key: string, params?: Record<string, string | number>): string
  has(key: string): boolean
  plural(key: string, count: number, params?: Record<string, string | number>): string
  scope(sub: string): IScopedI18n
}

// ── Block Instance ───────────────────────────────────────────────────────────

export interface IBlock {
  readonly id: string
  readonly type: string
  readonly plugin: BlockPlugin
  readonly element: HTMLElement
  readonly contentElement: HTMLElement
  readonly hasInlineTools: boolean
  /** Explicit per-block allowlist, or null when the editor-wide set applies. */
  readonly inlineToolTypes: readonly string[] | null
  /** Whether this block's plugin supports merge. */
  readonly canMerge: boolean
  readonly version: number
  focused: boolean
  selected: boolean

  save(): BlockData
  merge(data: Record<string, unknown>): void
  markDirty(): void
  /** Replace the content element with a new one, updating the DOM. */
  replaceContentElement(newEl: HTMLElement): void
  /** Clean up the plugin without removing the block element from DOM. */
  disposePlugin(): void
  /** Focus the first editable or focusable element within the block. */
  focus(): void
  destroy(): void
  /** Delegates to plugin.isEmpty() if defined, else checks textContent. */
  isEmpty(): boolean
  /** Get the block's settings UI (if plugin provides one). */
  renderSettings(): HTMLElement | HTMLElement[] | null
}

// ── Narrow Dependency Interfaces (DIP) ───────────────────────────────────────

/** Read-only block access. For modules that query but don't mutate. */
export interface IBlockReader {
  getBlockByIndex(index: number): IBlock | undefined
  getBlockById(id: string): IBlock | undefined
  getBlockByChildNode(node: DOMNode): IBlock | undefined
  getBlockByY(y: number): IBlock | undefined
  getCurrentBlock(): IBlock | undefined
  getCurrentIndex(): number
  getBlockCount(): number
  getBlockIndex(id: string): number
  /** Get all blocks in selected state. */
  getSelectedBlocks(): IBlock[]
  /** Check if any blocks are in selected state. */
  hasSelectedBlocks(): boolean
  [Symbol.iterator](): Iterator<IBlock>
}

/** Full block CRUD. Extends IBlockReader. */
export interface IBlockManager extends IBlockReader {
  setReadOnly(readOnly: boolean): void
  insert(
    type: string,
    data?: Record<string, unknown>,
    index?: number,
    id?: string,
    inline?: Record<string, EditorInlineWidget>,
  ): IBlock
  prepareReplacement(blockList: BlockData[] | undefined, defaultBlockType: string, logPrefix?: string): {
    blocks: readonly IBlock[]
    commit(options?: { notifyChange?: boolean }): void
    dispose(): void
  }
  remove(index: number): void
  move(fromIndex: number, toIndex: number): void
  convert(index: number, newType: string, extraData?: Record<string, unknown>): IBlock | undefined
  setCurrentIndex(index: number): void
  /** Clear selection state from all blocks. */
  clearSelection(): void
  /** Remove all selected blocks; insert defaultBlockType if none remain. */
  removeSelected(defaultBlockType: string): { focusIndex: number } | null
  clear(): void
}

export interface ISelectionManager {
  getCaret(): CaretPosition | null
  setCaretToBlock(blockId: string, position: 'start' | 'end'): void
  setCaretToOffset(blockId: string, textOffset: number): void
  getSelection(): InlineSelection | null
  isAtStart(): boolean
  isAtEnd(): boolean
  extractFragmentAfterCaret(): string | null
}

/** Block-level structural operations (split, merge, navigate). */
export interface IBlockOperations {
  splitBlock(): void
  exitEmptyBlock(): boolean
  mergeWithPrevious(): boolean
  mergeWithNext(): boolean
  navigateToPrevious(): boolean
  navigateToNext(): boolean
}

export interface IEventBus {
  on(event: string, handler: (data?: any) => void): () => void
  off(event: string, handler: (data?: any) => void): void
  once(event: string, handler: (data?: any) => void): () => void
  emit(event: string, data?: unknown): void
  clear(event?: string): void
}

// ── Cross-Block Selection ────────────────────────────────────────────────────

export interface ICrossBlockSelection {
  readonly range: Range | null
  set(range: Range): void
  clear(): void
  clone(): Range | null
  activate(range: Range, rootEl: HTMLElement): void
  deactivate(rootEl?: HTMLElement): void
}

// ── Public Editor API ────────────────────────────────────────────────────────

/** Public block handle without manager-integrity mutation methods. */
export interface EditorBlockView {
  readonly id: string
  readonly type: string
  readonly element: HTMLElement
  readonly contentElement: HTMLElement
  readonly focused: boolean
  readonly selected: boolean
  readonly hasInlineTools: boolean
  readonly canMerge: boolean
  readonly version: number
  focus(): void
  isEmpty(): boolean
}

/** Intentional public query/command surface for document blocks. */
export interface EditorBlocksApi {
  getBlockByIndex(index: number): EditorBlockView | undefined
  getBlockById(id: string): EditorBlockView | undefined
  getCurrentBlock(): EditorBlockView | undefined
  getCurrentIndex(): number
  getBlockCount(): number
  getBlockIndex(id: string): number
  getSelectedBlocks(): EditorBlockView[]
  hasSelectedBlocks(): boolean
  setCurrentIndex(index: number): void
  selectBlocks(blockIds: string[]): void
  clearSelection(): void
  insert(
    type: string,
    data?: Record<string, unknown>,
    index?: number,
    id?: string,
    inline?: Record<string, EditorInlineWidget>,
  ): EditorBlockView | undefined
  remove(index: number): void
  move(fromIndex: number, toIndex: number): void
  convert(index: number, type: string, data?: Record<string, unknown>): EditorBlockView | undefined
  [Symbol.iterator](): Iterator<EditorBlockView>
}

/** Subscription-only editor event API. */
export interface EditorEventSubscriptions {
  on<K extends keyof EditorEvents>(event: K, handler: (data: EditorEvents[K]) => void): () => void
  off<K extends keyof EditorEvents>(event: K, handler: (data: EditorEvents[K]) => void): void
  once<K extends keyof EditorEvents>(event: K, handler: (data: EditorEvents[K]) => void): () => void
}

export interface IEditor {
  save(): EditorDocument
  render(data: EditorDocument): void
  clear(): void
  focus(): void
  /**
   * Restore exactly one previous committed history step.
   * Returns false when the undo stack is empty or the editor is read-only.
   */
  undo(): boolean
  /**
   * Restore exactly one next committed history step.
   * Returns false when the redo stack is empty or the editor is read-only.
   */
  redo(): boolean
  /** Switch the live instance between interactive editing and read-only display. */
  setReadOnly(readOnly: boolean): void
  insertInlinePlugin(type: string, data?: Record<string, string>): boolean
  destroy(): void
  /** Remains readable after destroy() and then returns false. */
  readonly isReady: boolean
  readonly readOnly: boolean
  /** Whether undo() can currently restore a step; false while read-only. */
  readonly canUndo: boolean
  /** Whether redo() can currently restore a step; false while read-only. */
  readonly canRedo: boolean
  readonly blocks: EditorBlocksApi
  readonly events: EditorEventSubscriptions
  readonly rootElement: HTMLElement
}

// ── Inline Plugins ───────────────────────────────────────────────────────────

export interface InlinePlugin extends BasePlugin {
  /** Optional activation trigger. Must contain exactly one Unicode code point. */
  readonly trigger?: string
  /** Patterns that auto-convert pasted/typed text into this widget. */
  readonly pasteConfig?: { patterns: RegExp[] }
  /** Extract widget data from a matched pattern string. */
  onPatternMatch?(match: string): Record<string, string>

  /**
   * Build a live widget DOM from saved data. `id` is the widget's stable
   * instance identity (an `{{id}}` placeholder references it). When
   * provided, the factory MUST set it on the root element as `data-id`;
   * when omitted, the factory generates a fresh id (via `generateInlineId`).
   */
  createWidget(data: Record<string, string>, id?: string): HTMLElement
  /** Acquire editor-scoped resources after the editor root and context exist. */
  mount?(rootElement: HTMLElement, ctx: InlinePluginContext): void
  hydrate(element: HTMLElement, ctx: InlinePluginContext): void
  getData(element: HTMLElement): Record<string, string>
  /** Return false for an in-progress widget that must be serialized as plain text. */
  isCommitted?(element: HTMLElement): boolean
  onEdit?(element: HTMLElement, text: string, ctx: InlinePluginContext): void
  /** Called when the editor cancels an active trigger session. */
  onCancel?(): void
  onCommit?(element: HTMLElement, data: Record<string, string>): void
  destroy?(): void

  /**
   * Optional custom insertion hook for programmatic "+" (toolbox) clicks.
   *
   * When defined, `insertInlinePluginAtCaret` calls this INSTEAD of the
   * default `createWidget`-based flow. Useful for trigger-based plugins
   * (mention, hashtag, …) that want `+` to feel exactly like typing the
   * trigger character manually — inserting just the trigger text and
   * letting the usual onEdit / dropdown flow take over from there.
   */
  insertFresh?(ctx: InlinePluginContext): void
}

export interface InlinePluginContext {
  /** Current editor interaction mode. Mutation methods are inert when true. */
  readonly readOnly: boolean
  showPopup(anchor: HTMLElement, content: HTMLElement, cleanup?: () => void): void
  hidePopup(): void
  /** Execute one widget-local command as one undo/redo step. */
  mutate<T>(target: DOMNode, operation: () => T): T | undefined
  notifyChanged(target?: DOMNode): void
}

export interface IInlinePluginRegistry {
  register(plugin: InlinePlugin): void
  get(type: string): InlinePlugin | undefined
  getByTrigger(char: string): InlinePlugin | undefined
  values(): IterableIterator<InlinePlugin>
  readonly size: number
  readonly hasTriggers: boolean
  mount(rootElement: HTMLElement, ctx: InlinePluginContext): void
  triggerKeys(): string[]
  destroy(): void
}
