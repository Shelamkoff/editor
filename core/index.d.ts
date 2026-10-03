export type {
  BlockActivationStatus,
  BlockPluginDefinition,
  BlockTunes,
  BlockUpdate,
  ConversionPayload,
  ConversionTarget,
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