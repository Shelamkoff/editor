/** Selection information visible to one inline formatting tool. */
export interface InlineSelection {
  readonly blockId?: string
  readonly blockIds?: readonly string[]
  readonly range: Range
  readonly text?: string
}

/** Editor-owned cross-editable selection port bound after editor composition. */
export interface CrossEditableSelectionPort {
  readonly range: Range | null
  activate(range: Range): boolean
  deactivate(): void
}

/** Mutation gate supplied to a mounted inline control. */
export interface InlineMutationContext {
  mutate<T>(range: Range, operation: () => T): T | undefined
}

/** Scoped action-panel surface. */
export interface InlineToolActionContext {
  readonly range: Range
  mutate<T>(operation: () => T): T | undefined
  getTextAlign(): 'left' | 'center' | 'right' | 'justify' | 'mixed'
  setTextAlign(value: 'left' | 'center' | 'right' | 'justify' | null): boolean
  restoreSelection(): void
  close(): void
  readonly backLabel?: string
  showTooltip(anchor: HTMLElement, label: string, shortcut?: string): void
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
  bindSelectionPort?(port: CrossEditableSelectionPort | null): void
  destroy?(): void
}

/** Minimal localization dependency for the optional default preset. */
export interface InlineToolsI18n {
  t(key: string): string
}
