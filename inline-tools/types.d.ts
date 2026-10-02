/** Selection information visible to one inline formatting tool. */
export interface InlineSelection {
  readonly blockId?: string
  readonly range: Range
  readonly text?: string
}

/** Minimal cross-editable selection port consumed by formatting helpers. */
export interface CrossBlockSelectionPort {
  readonly range: Range | null
  set(range: Range): void
  clear(): void
  clone(): Range | null
  activate(range: Range, rootElement: HTMLElement): void
  deactivate(rootElement?: HTMLElement): void
}

/** Mutation gate supplied to a mounted inline control. */
export interface InlineMutationContext {
  mutate<T>(range: Range, operation: () => T): T | undefined
}

/** Scoped action-panel surface. */
export interface InlineToolActionContext {
  readonly range: Range
  mutate<T>(operation: () => T): T | undefined
  restoreSelection(): void
  close(): void
  showTooltip(anchor: HTMLElement, label: string): void
  hideTooltip(): void
}

/** Standalone inline formatting control. */
export interface InlineTool {
  readonly type: string
  readonly title?: string
  readonly icon: string
  readonly shortcut?: string
  readonly tag?: string

  isActive(selection: InlineSelection): boolean
  toggle(selection: InlineSelection): void
  renderActions?(context: InlineToolActionContext): HTMLElement | null
  getIcon?(active: boolean): string
  getTitle?(active: boolean): string
  onMount?(button: HTMLElement, mutations?: InlineMutationContext): void
  isDropdownOpen?(): boolean
  destroy?(): void
}

/** Minimal localization dependency for the optional default preset. */
export interface InlineToolsI18n {
  t(key: string): string
}
