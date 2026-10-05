/** Pure versioned schema shared by editor plugins and renderers. */
export interface BlockDataSchema<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly currentVersion: number
  createDefault(): D
  decode(input: { dataVersion: number, data: unknown }): {
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
  t(key: string, fallback?: string, params?: Record<string, string | number>): string
}

/** Revocable authority for one asynchronous persisted-data operation. */
export interface DataTask<
  D extends Record<string, unknown> = Record<string, unknown>
> {
  readonly signal: AbortSignal
  commit(producer: (current: Readonly<D>) => D): boolean
  cancel(): void
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
  beginTask(): DataTask<D>
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
  /** Cross-block selection becomes one default target, or imports each source fragment. Defaults to single. */
  selectionMode?: 'single' | 'per-block'
  export(data: Readonly<D>): ConversionPayload
  canImport(payload: ConversionPayload): boolean
  import(payload: ConversionPayload): D
  /** Optional single-target aggregation; receives owned payloads and an explicit document for HTML decoding. */
  joinSelection?(payloads: readonly ConversionPayload[], context: { readonly ownerDocument: Document }): ConversionPayload
}

/** Capabilities implemented independently from mounted block lifecycle. */
export interface BlockCapabilities<D extends Record<string, unknown>> {
  empty?: EmptyCapability<D>
  formatting?: FormattingCapability
  merge?: MergeCapability<D>
  conversion?: ConversionCapability<D>
  htmlImport?: HtmlImportCapability<D>
  clipboard?: ClipboardCapability<D>
  selectionSlice?: SelectionSliceCapability<D>
  inlineControls?: SettingsActionCapability<D>
  settings?: SettingsCapability<D>
  paste?: PasteCapability<D>
  shortcuts?: ShortcutCapability<D>
}


export interface LogicalFieldPoint {
  readonly fieldKey: string
  readonly offset: number
}

export interface SelectedFieldSlice {
  readonly fieldKey: string
  readonly before: string
  readonly selected: string
  readonly after: string
  readonly whole: boolean
}

export interface ClipboardSliceContext extends DataOperationContext {
  field(fieldKey: string): SelectedFieldSlice | null
}

export type ClipboardSlicePart<D extends Record<string, unknown>> =
  | { kind: 'local-block', data: D }
  | { kind: 'rich-text', html: string }

export interface ClipboardSlice<D extends Record<string, unknown>> {
  readonly parts: readonly ClipboardSlicePart<D>[]
  readonly remaining: D | null
  readonly focus: FocusTarget | null
}

export interface ClipboardCapability<D extends Record<string, unknown>> {
  slice(data: Readonly<D>, context: ClipboardSliceContext): ClipboardSlice<D>
}

export interface HtmlImportContext extends DataOperationContext {
  readonly ownerDocument: Document
  serializeRichText(node: Node): string
}

export interface HtmlImportCapability<D extends Record<string, unknown>> {
  matchesRoot(element: Element): boolean
  importRoot(element: Element, context: HtmlImportContext): D
}

export interface SelectionSliceContext extends DataOperationContext {
  sliceField(
    fieldKey: string,
    range: Readonly<{ start: number, end: number }>,
  ): { before: string, selected: string, after: string } | null
}

export interface SelectionSliceResult<D extends Record<string, unknown>> {
  before: D | null
  selected: ConversionPayload
  after: D | null
}

export interface SelectionSliceCapability<D extends Record<string, unknown>> {
  slice(
    data: Readonly<D>,
    start: LogicalFieldPoint,
    end: LogicalFieldPoint,
    context: SelectionSliceContext,
  ): SelectionSliceResult<D> | null
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
  | { kind: 'exit', data?: D }
  | { kind: 'focus', target: FocusTarget }
  | { kind: 'update', data: D, focus?: FocusTarget }

export interface ShortcutOperationContext extends DataOperationContext {
  /** Logical UTF-16 length, including one unit per line break or atomic widget. */
  fieldLength(fieldKey: string): number
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
  createDefault(): D
  decode(input: { dataVersion: number, data: unknown }): {
    dataVersion: number
    data: D
  }
  encode(data: Readonly<D>): {
    dataVersion: number
    data: D
  }
}

export interface InlineWidgetEditInput {
  readonly inputType: string
  readonly position: 'inside' | 'before' | 'after'
  readonly offset: number
  readonly text: string
  readonly data: string | null
}

export type InlineWidgetEditAction<D extends Record<string, unknown>> =
  | { kind: 'update', data: D }
  | { kind: 'remove' }
  | { kind: 'replace-text', text: string }

export interface InlineWidgetEditCapability<D extends Record<string, unknown>> {
  handle(input: InlineWidgetEditInput, data: Readonly<D>): InlineWidgetEditAction<D> | null
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
  beginTask(): DataTask<D>
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
  commit(data: D): boolean
  cancel(): void
}

/** Editor-scoped services for one inline-plugin definition. */
export interface InlinePluginRuntimeContext {
  readonly ownerDocument: Document
  readonly signal: AbortSignal
  t(key: string, fallback?: string, params?: Record<string, string | number>): string
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
  readonly editing?: InlineWidgetEditCapability<D>
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
  /** Localized group name used by the inline control trigger. */
  readonly label?: LocalizedLabel
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
