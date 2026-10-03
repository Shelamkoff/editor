import type {
  BlockPluginDefinition,
  ConversionPayload,
  FocusTarget,
  InlinePluginDefinition,
} from '../plugin-kit/types.js'
import type { InlineTool } from '../inline-tools/types.js'
import type {
  EditorBlockData,
  EditorInlineWidget,
  EditorOutputData,
} from '../shared/documentTypes.js'

export type { BlockPluginDefinition, ConversionPayload, FocusTarget, InlinePluginDefinition, InlineTool }
export type { EditorBlockData, EditorInlineWidget, EditorOutputData }

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T :
  T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T

export type BlockActivationStatus = 'active' | 'unregistered'
export type TextAlign = 'left' | 'center' | 'right' | 'justify'

export interface BlockTunes extends Record<string, unknown> {
  textAlign?: TextAlign
}

export interface EditorDocument extends EditorOutputData<EditorBlockData> {
  version: '2.0.0'
  blocks: EditorBlockData[]
}

export interface EditorBlockSnapshot {
  readonly id: string
  readonly type: string
  readonly dataVersion: number
  readonly data: Readonly<Record<string, unknown>>
  readonly tunes?: Readonly<BlockTunes>
  readonly inline?: Readonly<Record<string, EditorInlineWidget>>
  readonly revision?: string | number
  readonly status: BlockActivationStatus
}

export interface BlockUpdate {
  data?: Record<string, unknown>
  tunes?: BlockTunes | null
}

export interface InsertBlockInput {
  type: string
  data?: Record<string, unknown>
  tunes?: BlockTunes
  inline?: Record<string, EditorInlineWidget>
}

export interface ConversionTarget {
  type: string
  toolboxItemId?: string
}

export interface EditorBlocksApi extends Iterable<EditorBlockSnapshot> {
  readonly count: number
  readonly currentId: string | null

  get(id: string): EditorBlockSnapshot | undefined
  at(index: number): EditorBlockSnapshot | undefined
  list(): readonly EditorBlockSnapshot[]
  indexOf(id: string): number

  setCurrent(id: string): void
  selectedIds(): readonly string[]
  select(ids: readonly string[]): void
  clearSelection(): void

  insert(input: InsertBlockInput, index?: number): string
  update(id: string, producer: (current: EditorBlockSnapshot) => BlockUpdate): void
  remove(id: string): void
  move(id: string, to: number): void
  convert(id: string, target: ConversionTarget): EditorBlockSnapshot | undefined
  focus(id: string, target?: FocusTarget): boolean
}

export type DocumentChange =
  | { kind: 'block.insert'; index: number; block: EditorBlockData }
  | { kind: 'block.remove'; index: number; block: EditorBlockData }
  | { kind: 'block.update'; id: string; before: EditorBlockData; after: EditorBlockData }
  | { kind: 'block.move'; id: string; from: number; to: number }
  | { kind: 'document.replace'; before: EditorDocument; after: EditorDocument }

export interface TransactionCommitted {
  readonly sequence: number
  readonly origin: 'user' | 'native-input' | 'plugin' | 'external' | 'history'
  readonly action: 'commit' | 'undo' | 'redo'
  readonly name: string
  readonly changes: DeepReadonly<readonly DocumentChange[]>
  readonly history: DeepReadonly<{ canUndo: boolean; canRedo: boolean }>
}

export interface EditorEventMap {
  'editor:ready': undefined
  'editor:destroyed': undefined
  'transaction:committed': DeepReadonly<TransactionCommitted>
  'document:changed': DeepReadonly<Pick<TransactionCommitted, 'origin' | 'action' | 'changes'>>
  'history:changed': Readonly<{ canUndo: boolean; canRedo: boolean }>
  'readOnly:changed': Readonly<{ readOnly: boolean }>
  'currentBlock:changed': Readonly<{ currentId: string | null }>
  'selection:changed': Readonly<{ selectedIds: readonly string[] }>
}

export type EditorEventName =
  | 'editor:ready'
  | 'editor:destroyed'
  | 'transaction:committed'
  | 'document:changed'
  | 'history:changed'
  | 'readOnly:changed'
  | 'currentBlock:changed'
  | 'selection:changed'

export type EditorValidationReason =
  | 'invalid-input'
  | 'unsupported-document-version'
  | 'unsupported-data-version'
  | 'invalid-data'

export interface EditorValidationIssue {
  blockId?: string
  inlineId?: string
  type?: string
  reason?: EditorValidationReason
}

export type EditorDiagnosticCode =
  | 'command.failed'
  | 'command.slow'
  | 'paste.failed'
  | 'paste.slow'
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

export interface EditorDiagnostic {
  code: EditorDiagnosticCode
  timestamp: number
  durationMs?: number
  operation?: string
  pluginType?: string
  blockType?: string
  errorName?: string
}

export interface EditorConfig {
  holder: HTMLElement
  plugins: readonly BlockPluginDefinition[]
  inlinePlugins?: readonly InlinePluginDefinition[]
  inlineTools?: readonly InlineTool[]
  data?: EditorDocument
  defaultBlock?: string
  placeholder?: string
  readOnly?: boolean
  autofocus?: boolean
  injectStyles?: boolean
  theme?: string
  minHeight?: number
  locale?: Record<string, unknown>
  changeDebounceMs?: number
  historyMaxStack?: number
  historyCoalesceMs?: number
  dragThreshold?: number
  toolboxFilterThreshold?: number
  mobileBreakpoint?: number
  blockInsertAnimationMs?: number
  blockMoveAnimationMs?: number
  blockRemoveAnimationMs?: number
  onReady?: (editor: IEditor) => void | Promise<void>
  onChange?: (document: EditorDocument) => void | Promise<void>
  onValidationError?: (issue: EditorValidationIssue) => void | Promise<void>
  onDiagnostic?: (diagnostic: EditorDiagnostic) => void | Promise<void>
  diagnosticThresholds?: Partial<DiagnosticThresholds>
}

export interface IEditor {
  readonly blocks: EditorBlocksApi
  readonly isReady: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly readOnly: boolean

  save(): EditorDocument
  render(document: EditorDocument): void
  clear(): void
  undo(): boolean
  redo(): boolean
  focus(): boolean
  setReadOnly(readOnly: boolean): void
  insertInlinePlugin(type: string, data?: Record<string, unknown>): boolean
  on<K extends keyof EditorEventMap>(type: K, listener: (payload: EditorEventMap[K]) => void | Promise<void>): () => void
  destroy(): void
}
