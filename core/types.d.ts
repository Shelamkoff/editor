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

export type {
  DiagnosticThresholds,
  EditorDiagnostic,
  EditorDiagnosticCode,
} from './publicTypes.js'

/** Internal alias used by implementation modules. */
export interface EditorConfig extends PublicEditorConfig {}
