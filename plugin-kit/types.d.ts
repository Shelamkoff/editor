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
