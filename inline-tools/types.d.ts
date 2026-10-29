/** Selection information visible to one inline formatting tool. */
export interface InlineSelection {
  readonly blockId?: string
  readonly blockIds?: readonly string[]
  readonly range: Range
  readonly text?: string
  /** Current canonical alignment of the eligible selected blocks. */
  readonly textAlign?: 'left' | 'center' | 'right' | 'justify' | 'mixed'
}

/** Opaque selection right issued by the owning mounted formatting controller. */
declare const inlineSelectionBookmarkBrand: unique symbol
export interface InlineSelectionBookmark {
  readonly [inlineSelectionBookmarkBrand]: true
}

export interface InlineSelectionRestoreOptions {
  /** Non-cumulative UTF-16 adjustment of the original ordered end, only inside the owning mutation. */
  readonly endOffsetDelta?: number
}

/** Scoped formatting selection. No DOM field index or transferable range authority. */
export interface InlineSelectionPort {
  /** Fresh DOM view of the current logical selection, not a durable mutation address. */
  readonly range: Range | null
  /** Accepts equivalent logical endpoints only within the same current editor/field occurrences. */
  capture(range?: Range): InlineSelectionBookmark | null
  /** Rejects retired or foreign rights without moving focus or restoring another occurrence. */
  restore(bookmark: InlineSelectionBookmark, options?: InlineSelectionRestoreOptions): boolean
}

/** Mutation gate supplied to a mounted inline control. */
export interface InlineMutationContext {
  mutate<T>(bookmark: InlineSelectionBookmark, operation: (range: Range) => T): T | undefined
  /** Restore the invoking mounted control's current logical selection. */
  restoreSelection?(bookmark: InlineSelectionBookmark): boolean
}

/** Scoped action-panel surface. */
export interface InlineToolActionContext {
  readonly range: Range | null
  mutate<T>(operation: (range: Range) => T): T | undefined
  getTextAlign(): 'left' | 'center' | 'right' | 'justify' | 'mixed'
  setTextAlign(value: 'left' | 'center' | 'right' | 'justify' | null): boolean
  restoreSelection(): boolean
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
  bindSelectionPort?(port: InlineSelectionPort | null): void
  destroy?(): void
}

/** Minimal localization dependency for the optional default preset. */
export interface InlineToolsI18n {
  t(key: string): string
}
