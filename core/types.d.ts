import enLocale from './locale/en.js'
import type { EditorConfig as PublicEditorConfig } from './publicTypes.js'
import type { LocaleValue, PluralForms } from '../shared/localeTypes.js'

export type { LocaleValue, PluralForms }
export type { InlineTool, InlineMutationContext, InlineToolActionContext, InlineSelection } from '../inline-tools/types.js'

/** Existing serialized engine lifecycle, independent of health and scope state. */
export type TransactionPhase =
  | 'idle'
  | 'preparing-metadata'
  | 'capturing-selection'
  | 'building'
  | 'preparing-projection'
  | 'applying-projection'
  | 'committing'
  | 'finalizing'
  | 'publishing'
  | 'diagnostic-observation'
  | 'failed'

/** Effective admission context; runtime callbacks do not add engine states. */
export type RuntimeMutationContext = TransactionPhase
  | 'validation-observation'
  | 'presentation-projection'
  | 'extension-preparation'
  | 'protected-projection-edit'
  | 'read-only-transition'

/** Explicit DOM alias used by JavaScript JSDoc without colliding with Node.js types. */
export type DOMNode = Node

/** Core locale dictionary shape used internally by I18n. */
type CoreMessages = { [K in keyof typeof enLocale]: LocaleValue }
export interface I18nMessages extends CoreMessages {}
export type MessageKey = keyof I18nMessages

export type {
  DiagnosticThresholds,
  EditorDiagnostic,
  EditorDiagnosticCode,
} from './publicTypes.js'

/** Narrow internal contract consumed by runtime modules. */
export interface DiagnosticsSink {
  threshold(name: keyof import('./publicTypes.js').DiagnosticThresholds): number
  now(): number
  emit(
    code: import('./publicTypes.js').EditorDiagnosticCode,
    details?: Omit<import('./publicTypes.js').EditorDiagnostic, 'code' | 'timestamp'>,
  ): void
  errorName(error: unknown): string
}

/** Internal alias used by implementation modules. */
export interface EditorConfig extends PublicEditorConfig {}
