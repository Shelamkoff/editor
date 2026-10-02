import type {
  BlockPluginDefinition,
  ConversionPayload,
  FocusTarget,
  InlinePluginDefinition,
} from '../plugin-kit/types.js'
import type {
  EditorBlockData,
  EditorInlineWidget,
  EditorOutputData,
} from '../shared/documentTypes.js'

export type { BlockPluginDefinition, ConversionPayload, FocusTarget, InlinePluginDefinition }
export type { EditorBlockData, EditorInlineWidget, EditorOutputData }

export type DocumentMode = 'editable' | 'preserved'
export type BlockActivationStatus = 'active' | 'preserved'
export type TextAlign = 'left' | 'center' | 'right' | 'justify'

export interface BlockTunes extends Record<string, unknown> {
  textAlign?: TextAlign
}

export interface EditorDocument extends EditorOutputData<EditorBlockData> {
  version: string
  blocks: EditorBlockData[]
}

export interface EditorBlockSnapshot {
  readonly id: string
  readonly type: string
  readonly dataVersion?: number
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

export type EditorEventName =
  | 'editor:ready'
  | 'editor:destroyed'
  | 'transaction:committed'
  | 'document:changed'
  | 'history:changed'
  | 'readOnly:changed'

export interface EditorValidationIssue {
  blockId?: string
  inlineId?: string
  type?: string
  reason?: string
  error?: unknown
}

export interface EditorConfig {
  holder: HTMLElement
  plugins: readonly BlockPluginDefinition[]
  inlinePlugins?: readonly InlinePluginDefinition[]
  data?: EditorDocument
  defaultBlock?: string
  placeholder?: string
  readOnly?: boolean
  injectStyles?: boolean
  theme?: 'light' | 'dark'
  minHeight?: number
  locale?: Record<string, unknown>
  validationMode?: 'preserve' | 'strict'
  documentVersionPolicy?: 'preserve' | 'strict'
  changeDebounceMs?: number
  onReady?: (editor: IEditor) => void | Promise<void>
  onChange?: (document: EditorDocument) => void | Promise<void>
  onValidationError?: (issue: EditorValidationIssue) => void
}

export interface IEditor {
  readonly blocks: EditorBlocksApi
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly readOnly: boolean
  readonly documentMode: DocumentMode

  save(): EditorDocument
  render(document: EditorDocument): void
  clear(): void
  undo(): boolean
  redo(): boolean
  focus(): boolean
  setReadOnly(readOnly: boolean): void
  insertInlinePlugin(type: string, data?: Record<string, unknown>): boolean
  on(type: EditorEventName, listener: (payload?: unknown) => void): () => void
  destroy(): void
}
