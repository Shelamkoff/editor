export type {
  EditorDocument,
  BlockData,
  DocumentMigration,
  EditorDiagnostic,
  EditorDiagnosticCode,
  DiagnosticThresholds,
  BasePlugin,
  BlockPlugin,
  BlockMutationContext,
  BlockPluginConstructor,
  ToolboxEntry,
  PasteConfig,
  PasteEvent,
  TagPasteEvent,
  FilePasteEvent,
  PatternPasteEvent,
  ShortcutEntry,
  InlineTool,
  InlineToolActionContext,
  CaretPosition,
  InlineSelection,
  EditorEvents,
  EditorConfig,
  I18nMessages,
  IBlock,
  IBlockReader,
  IBlockManager,
  ISelectionManager,
  IBlockOperations,
  IEventBus,
  EditorBlockView,
  EditorBlocksApi,
  EditorEventSubscriptions,
  IEditor,
  ICrossBlockSelection,
  InlineControlContext,
  InlineControlGroup,
} from './types.js'

export function createEditor(config: import('./types.js').EditorConfig): import('./types.js').IEditor
export function createDefaultInlineTools(options?: { i18n?: import('./I18n.js').I18n, crossBlockSelection?: import('./types.js').ICrossBlockSelection }): import('./types.js').InlineTool[]
export function uid(): string
export function sanitizeHtml(html: string): string
export function escapeHtml(text: string): string

export { DocumentSchema } from './DocumentSchema.js'
export { InlinePluginRegistry } from './InlinePluginRegistry.js'
export { createColorSwatchPlugin } from '../inline-plugins/color.js'
export { createMentionPlugin } from '../inline-plugins/mention/index.js'
export type {
  MentionItem,
  MentionSearchResult,
  MentionSearchFunction,
  MentionRenderItem,
  MentionRenderNoResults,
  MentionRenderLoading,
  MentionPluginOptions,
} from '../inline-plugins/mention/index.js'
