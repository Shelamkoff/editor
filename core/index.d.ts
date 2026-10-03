export type {
  BlockActivationStatus,
  BlockPluginDefinition,
  BlockTunes,
  BlockUpdate,
  ConversionPayload,
  ConversionTarget,
  DocumentMode,
  EditorBlockSnapshot,
  EditorBlocksApi,
  EditorConfig,
  EditorDocument,
  EditorEventName,
  EditorInlineWidget,
  EditorOutputData,
  EditorValidationIssue,
  FocusTarget,
  IEditor,
  InlinePluginDefinition,
  InsertBlockInput,
  TextAlign,
} from './publicTypes.js'

export function createEditor(config: import('./publicTypes.js').EditorConfig): import('./publicTypes.js').IEditor
export function uid(): string
export function sanitizeHtml(html: string, ownerDocument?: Document): string
export function escapeHtml(text: string): string

export { DocumentSchema } from './DocumentSchema.js'
