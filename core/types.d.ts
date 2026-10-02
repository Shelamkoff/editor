import enLocale from './locale/en.js'
import type { EditorConfig as PublicEditorConfig, EditorDocument } from './publicTypes.js'
import type { LocaleValue, PluralForms } from '../shared/localeTypes.js'

export type { EditorDocument, LocaleValue, PluralForms }
export type { InlineTool, InlineMutationContext, InlineToolActionContext, InlineSelection } from '../inline-tools/types.js'

/** Explicit DOM alias used by JavaScript JSDoc without colliding with Node.js types. */
export type DOMNode = Node

/** Core locale dictionary shape used internally by I18n. */
type CoreMessages = { [K in keyof typeof enLocale]: LocaleValue }
export interface I18nMessages extends CoreMessages {}
export type MessageKey = keyof I18nMessages

/** Internal diagnostics codes. Diagnostics are content-free and never expose document payloads. */
export type EditorDiagnosticCode =
  | 'command.failed'
  | 'command.slow'
  | 'paste.failed'
  | 'paste.slow'
  | 'migration.applied'
  | 'migration.failed'
  | 'migration.unavailable'
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
  fromVersion?: string
  toVersion?: string
  errorName?: string
}

/** Internal config augmentation consumed only by the diagnostics utility. */
export interface EditorConfig extends PublicEditorConfig {
  onDiagnostic?: (diagnostic: EditorDiagnostic) => void | Promise<void>
  diagnosticThresholds?: Partial<DiagnosticThresholds>
}
