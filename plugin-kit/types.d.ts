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
