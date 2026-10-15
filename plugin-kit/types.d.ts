/** Pure versioned schema shared by editor plugins and renderers. */
export interface BlockDataSchema<
  D extends object = object
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
  /** Enumerate all rich fields, including hidden fields, with unique nonempty stable keys. */
  mapRichText?(
    data: D,
    transform: (html: string, fieldKey: string) => string,
  ): D
}

/** Mounted logical field. Keys and elements are unique across all modes. */
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
  D extends object = object
> {
  readonly signal: AbortSignal
  commit(producer: (current: Readonly<D>) => D): boolean
  cancel(): void
}

/** Block-scoped mutation/lifecycle services supplied to one instance. */
export interface BlockInstanceContext<
  D extends object = object
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
  D extends object = object
> {
  readonly element: HTMLElement
  /** Detached candidate membership/order and controls; core owns rich DOM synchronization. */
  read(): D
  update?(next: Readonly<D>, previous: Readonly<D>): void
  editableFields?(): readonly EditableField[]
  setReadOnly(readOnly: boolean): void
  focus?(target?: FocusTarget): void
  destroy(): void
}

/** Per-editor runtime created from one reusable immutable definition. */
export interface BlockPluginRuntime<
  D extends object = object
> {
  create(initial: Readonly<D>, context: BlockInstanceContext<D>): BlockInstance<D>
  destroy(): void
}

/** Reusable immutable block plugin v2 definition. */
export interface BlockPluginDefinition<
  D extends object = object
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
export interface EmptyCapability<D extends object> {
  isEmpty(data: Readonly<D>): boolean
}

/** Inline formatting eligibility for one block type. */
export interface FormattingCapability {
  inlineTools: true | readonly string[]
}

/** Pure data merge capability. */
export interface MergeCapability<D extends object> {
  merge(target: Readonly<D>, source: Readonly<D>): D
}

/** Neutral conversion payload exchanged between block types. */
export interface ConversionPayload {
  kind: string
  data: Record<string, unknown>
}

/** Pure block conversion capability. */
export interface ConversionCapability<D extends object> {
  /** Cross-block selection becomes one default target, or imports each source fragment. Defaults to single. */
  selectionMode?: 'single' | 'per-block'
  export(data: Readonly<D>): ConversionPayload
  canImport(payload: ConversionPayload): boolean
  import(payload: ConversionPayload): D
  /** Optional single-target aggregation; receives owned payloads and an explicit document for HTML decoding. */
  joinSelection?(payloads: readonly ConversionPayload[], context: { readonly ownerDocument: Document }): ConversionPayload
}

/** Capabilities implemented independently from mounted block lifecycle. */
export interface BlockCapabilities<D extends object> {
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

export type ClipboardSlicePart<D extends object> =
  | { kind: 'local-block', data: D }
  | { kind: 'rich-text', html: string }

export interface ClipboardSlice<D extends object> {
  readonly parts: readonly ClipboardSlicePart<D>[]
  readonly remaining: D | null
  readonly focus: FocusTarget | null
}

export interface ClipboardCapability<D extends object> {
  slice(data: Readonly<D>, context: ClipboardSliceContext): ClipboardSlice<D>
}

export interface HtmlImportContext extends DataOperationContext {
  readonly ownerDocument: Document
  serializeRichText(node: Node): string
}

export interface HtmlImportCapability<D extends object> {
  matchesRoot(element: Element): boolean
  importRoot(element: Element, context: HtmlImportContext): D
}

export interface SelectionSliceContext extends DataOperationContext {
  sliceField(
    fieldKey: string,
    range: Readonly<{ start: number, end: number }>,
  ): { before: string, selected: string, after: string } | null
}

export interface SelectionSliceResult<D extends object> {
  before: D | null
  selected: ConversionPayload
  after: D | null
}

export interface SelectionSliceCapability<D extends object> {
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

export type BlockShortcutAction<D extends object> =
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

export interface ShortcutCapability<D extends object> {
  handle(
    input: BlockShortcutInput,
    data: Readonly<D>,
    context: ShortcutOperationContext,
  ): BlockShortcutAction<D> | null
}

/** Pure versioned schema for canonical inline-widget payloads. */
export interface InlineWidgetSchema<
  D extends object = object
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
  /** Browser-supplied UTF-16 deletion interval in the widget text, when available. */
  readonly deletionRange?: Readonly<{ start: number, end: number }>
}

export type InlineWidgetEditAction<D extends object> =
  | { kind: 'update', data: D }
  | { kind: 'remove' }
  | { kind: 'replace-text', text: string }

export interface InlineWidgetEditCapability<D extends object> {
  handle(input: InlineWidgetEditInput, data: Readonly<D>): InlineWidgetEditAction<D> | null
}

/** One mounted interactive inline widget occurrence. */
export interface InlineWidgetInstance<
  D extends object = object
> {
  readonly element: HTMLElement
  update?(next: Readonly<D>, previous: Readonly<D>): void
  setReadOnly(readOnly: boolean): void
  focus?(): void
  destroy(): void
}

/** Widget-scoped mutation/lifecycle services. */
export interface InlineWidgetContext<
  D extends object = object
> {
  readonly id: string
  readonly blockId: string
  readonly fieldKey: string
  readonly signal: AbortSignal
  getData(): Readonly<D>
  updateData(producer: (current: Readonly<D>) => D, options?: { trailingText?: string }): void
  commitDomMutation(operation: () => void): void
  beginTask(): DataTask<D>
  isReadOnly(): boolean
}

/** Trigger/autocomplete session owned by an inline plugin runtime. */
export interface InlineTriggerSession<
  D extends object = object
> {
  readonly blockId: string
  readonly fieldKey: string
  readonly query: string
  readonly range: Readonly<{ start: number, end: number }>
  readonly anchor: HTMLElement
  commit(data: D, options?: { trailingText?: string }): boolean
  cancel(): void
}

/** Revocable close capability for exactly one popup presentation. */
export interface InlinePopupHandle {
  close(): void
}

/** Editor-scoped services for one inline-plugin definition. */
export interface InlinePluginRuntimeContext {
  readonly ownerDocument: Document
  readonly signal: AbortSignal
  t(key: string, fallback?: string, params?: Record<string, string | number>): string
  showPopup(anchor: HTMLElement, content: HTMLElement, cleanup?: () => void): InlinePopupHandle
}

/** Per-editor inline runtime. */
export interface InlinePluginRuntime<
  D extends object = object
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
export type InlineFreshInsertion<D extends object> =
  | { kind: 'widget', data: D }
  | { kind: 'text', text: string }

export interface InlineWidgetPasteCapability<D extends object> {
  readonly patterns: readonly RegExp[]
  fromMatch(match: string): D | null
}

/** Immutable inline-plugin v2 definition. */
export interface InlinePluginDefinition<
  D extends object = object
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
    trailingText?: string
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
  D extends object = object
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
  /** Optional short text for an inline control trigger; menus retain the full label. */
  compactLabel?: LocalizedLabel
  icon?: string
  active?: boolean
  disabled?: boolean
}

export interface SettingsActionCapability<D extends object> {
  kind: 'actions'
  /** Localized group name used by the inline control trigger. */
  readonly label?: LocalizedLabel
  actions(data: Readonly<D>, context: ExtensionUiContext): readonly SettingsAction[]
  apply(data: Readonly<D>, actionId: string, context: DataOperationContext): D
}

export interface SettingsPanelContext<D extends object>
  extends ExtensionUiContext {
  getData(): Readonly<D>
  updateData(producer: (current: Readonly<D>) => D): void
}

export interface SettingsPanelCapability<D extends object> {
  kind: 'panel'
  render(context: SettingsPanelContext<D>): HTMLElement
}

export type SettingsCapability<D extends object> =
  | SettingsActionCapability<D>
  | SettingsPanelCapability<D>

export type PasteInput =
  | { kind: 'text', text: string }
  | { kind: 'file', file: File }

export interface PasteResolveContext extends DataOperationContext {
  readonly signal: AbortSignal
  readonly ownerDocument: Document
}

export type PasteResult<D extends object> =
  | { kind: 'block', data: D }
  | { kind: 'rich-text', replacement: { kind: 'text', text: string } | { kind: 'html', html: string } }

export interface PasteCapability<D extends object> {
  accepts(input: PasteInput): boolean
  resolve(
    input: PasteInput,
    context: PasteResolveContext,
  ): PasteResult<D> | null | Promise<PasteResult<D> | null>
}
