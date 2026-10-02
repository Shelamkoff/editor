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
