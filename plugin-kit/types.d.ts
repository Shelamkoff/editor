import type { LocaleValue } from '../shared/localeTypes.js'

/** Runtime services exposed to one mounted block plugin instance. */
export interface BlockMutationContext {
  readonly ownerDocument?: Document
  readonly restoring?: boolean
  mutate<T>(operation: () => T): T | undefined
  splitBlock(): void
  exitEmptyBlock(): boolean
  readonly readOnly: boolean
}

/** Scoped controls API used by plugin-owned inline toolbar controls. */
export interface InlineControlContext {
  suppressSelectionChange(): void
  mutate<T>(operation: () => T): T | undefined
  onContentElementChanged(newElement: HTMLElement): void
}

/** Plugin-owned inline toolbar group. */
export interface InlineControlGroup {
  elements: HTMLElement[]
  destroy?(): void
}


/** Shared metadata surface for extension definitions in the v1 migration layer. */
export interface BasePlugin {
  readonly type: string
  readonly title: string
  readonly icon: string
  readonly locale?: Record<string, Record<string, LocaleValue>>
  setI18n?(i18n: { t(key: string): string }): void
}

/** Plugin-facing scoped localization surface. */
export interface IScopedI18n {
  t(key: string, params?: Record<string, string | number>): string
  has(key: string): boolean
  plural(key: string, count: number, params?: Record<string, string | number>): string
  scope(sub: string): IScopedI18n
}

/** Runtime services exposed to legacy inline-widget plugins during the v2 migration. */
export interface InlinePluginContext {
  readonly readOnly: boolean
  showPopup(anchor: HTMLElement, content: HTMLElement, cleanup?: () => void): void
  hidePopup(): void
  mutate<T>(target: Node, operation: () => T): T | undefined
  notifyChanged(target?: Node): void
}

/** Legacy inline-widget plugin contract while model-owned widgets are introduced. */
export interface InlinePlugin extends BasePlugin {
  readonly styles?: readonly string[]
  readonly trigger?: string
  readonly pasteConfig?: { patterns: RegExp[] }
  onPatternMatch?(match: string): Record<string, string>
  createWidget(data: Record<string, string>, id?: string, context?: { readonly ownerDocument: Document }): HTMLElement
  mount?(rootElement: HTMLElement, ctx: InlinePluginContext): void
  hydrate(element: HTMLElement, ctx: InlinePluginContext): void
  getData(element: HTMLElement): Record<string, string>
  isCommitted?(element: HTMLElement): boolean
  onEdit?(element: HTMLElement, text: string, ctx: InlinePluginContext): void
  onCancel?(): void
  onCommit?(element: HTMLElement, data: Record<string, string>): void
  destroy?(): void
  insertFresh?(ctx: InlinePluginContext): void
}


/** Immutable runtime configuration shared by legacy block plugins during migration. */
export interface PluginRuntimeConfig extends Record<string, unknown> {
  injectStyles?: boolean
  css?: string
}

/** Toolbox entry exposed by a block plugin. */
export interface ToolboxEntry {
  title: string
  icon: string
  data?: Record<string, unknown>
}

/** Clipboard formats a block plugin can claim. */
export interface PasteConfig {
  tags?: string[]
  files?: string[]
  patterns?: RegExp[]
}

export interface TagPasteEvent {
  type: 'tag'
  element: HTMLElement
  tag: string
}

export interface FilePasteEvent {
  type: 'file'
  file: File
}

export interface PatternPasteEvent {
  type: 'pattern'
  data: string
}

export type PasteEvent = TagPasteEvent | FilePasteEvent | PatternPasteEvent

/** Keyboard shortcut owned by one block plugin. */
export interface ShortcutEntry {
  combo: string
  handler: (contentElement: HTMLElement) => void
}

/**
 * Legacy block plugin contract while BlockPluginDefinition/BlockInstance v2 is
 * introduced. This is the canonical extension-facing definition; core imports
 * and re-exports it instead of owning a duplicate copy.
 */
export interface BlockPlugin<
  D extends Record<string, unknown> = Record<string, unknown>
> extends BasePlugin {
  readonly inlineTools?: boolean | string[]
  getPluginConfig?(): PluginRuntimeConfig
  setPlaceholder?(placeholder: string): void

  render(data: D, context: BlockMutationContext): HTMLElement
  save(element: HTMLElement): D

  validate?(data: D): boolean
  dispose?(): void
  destroy?(element: HTMLElement): void
  isEmpty?(element: HTMLElement): boolean

  toolbox?: ToolboxEntry | ToolboxEntry[]
  shortcuts?: ShortcutEntry[]

  merge?(element: HTMLElement, data: D): void

  renderSettings?(element: HTMLElement): HTMLElement | HTMLElement[] | null
  changeLevel?(element: HTMLElement, level: number): HTMLElement
  onSettingsAction?(element: HTMLElement, action: string): Record<string, unknown> | null

  pasteConfig?: PasteConfig
  onPaste?(event: PasteEvent): D | null
  waitForPaste?(element: HTMLElement): Promise<void>

  exportData?(element: HTMLElement): Record<string, unknown>
  splitSelection?(element: HTMLElement, range: Range): {
    remainingData: D | null
    selectedData: Record<string, unknown>
  } | null

  renderInlineControls?(
    contentElement: HTMLElement,
    ctx: InlineControlContext,
  ): InlineControlGroup | null

  mapTextFields?(data: D, transform: (html: string) => string): void
}

/** Static metadata supported by legacy block plugin classes. */
export interface BlockPluginConstructor<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  new (): BlockPlugin<D>
  styles?: string[]
  locale?: Record<string, Record<string, LocaleValue>>
  isTextBlock?: boolean
}


/** Pure versioned schema shared by editor plugins and renderers. */
export interface BlockDataSchema<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly currentVersion: number
  readonly legacyVersion: number
  createDefault(): D
  decode(input: { dataVersion?: number, data: unknown }): {
    dataVersion: number
    data: D
  }
  encode(data: Readonly<D>): {
    dataVersion: number
    data: D
  }
  mapRichText?(
    data: D,
    transform: (html: string, fieldKey: string) => string,
  ): D
}

/** Stable logical editable field exposed by one mounted block instance. */
export interface EditableField {
  readonly key: string
  readonly element: HTMLElement
  readonly mode: 'rich-text' | 'plain-text'
}

/** Logical focus request independent of DOM identity. */
export interface FocusTarget {
  fieldKey?: string
  offset?: number | 'start' | 'end'
}

/** Editor-scoped services supplied once when a definition is activated. */
export interface BlockPluginRuntimeContext {
  readonly ownerDocument: Document
  readonly signal: AbortSignal
  readonly isDefaultBlock: boolean
  readonly editorPlaceholder?: string
  t(key: string, fallback?: string): string
}

/** Block-scoped mutation/lifecycle services supplied to one instance. */
export interface BlockInstanceContext<
  D extends Record<string, unknown> = Record<string, unknown>
> extends DataOperationContext {
  readonly ownerDocument: Document
  readonly signal: AbortSignal
  getData(): Readonly<D>
  updateData(producer: (current: Readonly<D>) => D): void
  commitDomMutation(operation: () => void): void
  requestSplit(): void
  requestExit(): void
  isReadOnly(): boolean
}

/** One mounted block occurrence. Mutable state belongs here, not on the definition. */
export interface BlockInstance<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly element: HTMLElement
  read(): D
  update?(next: Readonly<D>, previous: Readonly<D>): void
  editableFields?(): readonly EditableField[]
  setReadOnly(readOnly: boolean): void
  focus?(target?: FocusTarget): void
  destroy(): void
}

/** Per-editor runtime created from one reusable immutable definition. */
export interface BlockPluginRuntime<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  create(initial: Readonly<D>, context: BlockInstanceContext<D>): BlockInstance<D>
  destroy(): void
}

/** Reusable immutable block plugin v2 definition. */
export interface BlockPluginDefinition<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly type: string
  readonly label: Readonly<{ key: string, fallback: string }>
  readonly icon: string
  readonly styles?: readonly string[]
  readonly toolbox?: readonly ToolboxItemDefinition<D>[]
  readonly schema: BlockDataSchema<D>
  readonly capabilities?: BlockCapabilities<D>
  setup(context: BlockPluginRuntimeContext): BlockPluginRuntime<D>
}


/** Pure empty-state capability used by generic structural commands. */
export interface EmptyCapability<D extends Record<string, unknown>> {
  isEmpty(data: Readonly<D>): boolean
}

/** Inline formatting eligibility for one block type. */
export interface FormattingCapability {
  inlineTools: true | readonly string[]
}

/** Pure data merge capability. */
export interface MergeCapability<D extends Record<string, unknown>> {
  merge(target: Readonly<D>, source: Readonly<D>): D
}

/** Neutral conversion payload exchanged between block types. */
export interface ConversionPayload {
  kind: string
  data: Record<string, unknown>
}

/** Pure block conversion capability. */
export interface ConversionCapability<D extends Record<string, unknown>> {
  export(data: Readonly<D>): ConversionPayload
  canImport(payload: ConversionPayload): boolean
  import(payload: ConversionPayload): D
}

/** Capabilities implemented independently from mounted block lifecycle. */
export interface BlockCapabilities<D extends Record<string, unknown>> {
  empty?: EmptyCapability<D>
  formatting?: FormattingCapability
  merge?: MergeCapability<D>
  conversion?: ConversionCapability<D>
  settings?: SettingsCapability<D>
  paste?: PasteCapability<D>
  shortcuts?: ShortcutCapability<D>
}


/** Logical keyboard input resolved by core for one editable field. */
export interface BlockShortcutInput {
  readonly key: string
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly fieldKey: string
  readonly selection: Readonly<{ start: number, end: number }>
  readonly fieldLength: number
}

export type BlockShortcutAction<D extends Record<string, unknown>> =
  | { kind: 'native' }
  | { kind: 'consume' }
  | { kind: 'exit' }
  | { kind: 'focus', target: FocusTarget }
  | { kind: 'update', data: D, focus?: FocusTarget }

export interface ShortcutOperationContext extends DataOperationContext {
  splitField(fieldKey: string, range: Readonly<{ start: number, end: number }>): {
    before: string
    after: string
  } | null
}

export interface ShortcutCapability<D extends Record<string, unknown>> {
  handle(
    input: BlockShortcutInput,
    data: Readonly<D>,
    context: ShortcutOperationContext,
  ): BlockShortcutAction<D> | null
}

/** Pure versioned schema for canonical inline-widget payloads. */
export interface InlineWidgetSchema<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly currentVersion: number
  readonly legacyVersion: number
  createDefault(): D
  decode(input: { dataVersion?: number, data: unknown }): {
    dataVersion: number
    data: D
  }
  encode(data: Readonly<D>): {
    dataVersion: number
    data: D
  }
}

/** One mounted interactive inline widget occurrence. */
export interface InlineWidgetInstance<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly element: HTMLElement
  update?(next: Readonly<D>, previous: Readonly<D>): void
  setReadOnly(readOnly: boolean): void
  focus?(): void
  destroy(): void
}

/** Widget-scoped mutation/lifecycle services. */
export interface InlineWidgetContext<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly id: string
  readonly blockId: string
  readonly fieldKey: string
  readonly signal: AbortSignal
  getData(): Readonly<D>
  updateData(producer: (current: Readonly<D>) => D): void
  isReadOnly(): boolean
}

/** Trigger/autocomplete session owned by an inline plugin runtime. */
export interface InlineTriggerSession<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly blockId: string
  readonly fieldKey: string
  readonly query: string
  readonly range: Readonly<{ start: number, end: number }>
  readonly anchor: HTMLElement
  commit(data: D): void
  cancel(): void
}

/** Editor-scoped services for one inline-plugin definition. */
export interface InlinePluginRuntimeContext {
  readonly ownerDocument: Document
  readonly signal: AbortSignal
  t(key: string, fallback?: string): string
  showPopup(anchor: HTMLElement, content: HTMLElement, cleanup?: () => void): void
  hidePopup(): void
}

/** Per-editor inline runtime. */
export interface InlinePluginRuntime<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  create(
    id: string,
    initial: Readonly<D>,
    context: InlineWidgetContext<D>,
  ): InlineWidgetInstance<D>
  onTriggerQuery?(session: InlineTriggerSession<D>): void
  onTriggerKeydown?(event: KeyboardEvent, session: InlineTriggerSession<D>): 'handled' | 'pass'
  onTriggerCancel?(): void
  destroy(): void
}

/** Programmatic fresh insertion result. */
export type InlineFreshInsertion<D extends Record<string, unknown>> =
  | { kind: 'widget', data: D }
  | { kind: 'text', text: string }

export interface InlineWidgetPasteCapability<D extends Record<string, unknown>> {
  readonly patterns: readonly RegExp[]
  fromMatch(match: string): D | null
}

/** Immutable inline-plugin v2 definition. */
export interface InlinePluginDefinition<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly type: string
  readonly label: Readonly<{ key: string, fallback: string }>
  readonly icon: string
  readonly styles?: readonly string[]
  readonly trigger?: string
  readonly schema: InlineWidgetSchema<D>
  readonly paste?: InlineWidgetPasteCapability<D>
  readonly insertion?: Readonly<{
    createInitial(): InlineFreshInsertion<D>
  }>
  setup(context: InlinePluginRuntimeContext): InlinePluginRuntime<D>
}


/** Narrow allocator available to pure data operations that create nested identities. */
export interface DataOperationContext {
  createId(prefix: string): string
}

export interface LocalizedLabel {
  key: string
  fallback: string
}

export interface ToolboxItemDefinition<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  id: string
  label: LocalizedLabel
  icon: string
  configure?(base: Readonly<D>, context: DataOperationContext): D
}

export interface ExtensionUiContext {
  readonly ownerDocument: Document
  t(label: LocalizedLabel): string
}

export interface SettingsAction {
  id: string
  label: LocalizedLabel
  icon?: string
  active?: boolean
  disabled?: boolean
}

export interface SettingsActionCapability<D extends Record<string, unknown>> {
  kind: 'actions'
  actions(data: Readonly<D>, context: ExtensionUiContext): readonly SettingsAction[]
  apply(data: Readonly<D>, actionId: string, context: DataOperationContext): D
}

export interface SettingsPanelContext<D extends Record<string, unknown>>
  extends ExtensionUiContext {
  getData(): Readonly<D>
  updateData(producer: (current: Readonly<D>) => D): void
}

export interface SettingsPanelCapability<D extends Record<string, unknown>> {
  kind: 'panel'
  render(context: SettingsPanelContext<D>): HTMLElement
}

export type SettingsCapability<D extends Record<string, unknown>> =
  | SettingsActionCapability<D>
  | SettingsPanelCapability<D>

export type PasteInput =
  | { kind: 'text', text: string }
  | { kind: 'html', html: string }
  | { kind: 'file', file: File }

export interface PasteResolveContext extends DataOperationContext {
  readonly signal: AbortSignal
  readonly ownerDocument: Document
}

export type PasteResult<D extends Record<string, unknown>> =
  | { kind: 'block', data: D }
  | { kind: 'rich-text', replacement: { kind: 'text', text: string } | { kind: 'html', html: string } }

export interface PasteCapability<D extends Record<string, unknown>> {
  accepts(input: PasteInput): boolean
  resolve(
    input: PasteInput,
    context: PasteResolveContext,
  ): PasteResult<D> | null | Promise<PasteResult<D> | null>
}
