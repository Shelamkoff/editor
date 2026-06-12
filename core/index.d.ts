export type {
  EditorDocument,
  BlockData,
  BasePlugin,
  BlockPlugin,
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
  IEditor,
  ICrossBlockSelection,
  InlineControlContext,
  InlineControlGroup,
} from './types'

export { EditorFacade } from './EditorFacade'
export { Block } from './Block'
export { BlockManager } from './BlockManager'
export { BlockOperations } from './BlockOperations'
export { SelectionManager } from './SelectionManager'
export { ShortcutRegistry } from './ShortcutRegistry'
export { EventBus } from '../../event-bus'
export { Toolbar } from './toolbar/Toolbar'
export { InlineToolbar } from './inline-toolbar/InlineToolbar'
export { TypeSelector } from './TypeSelector'
export { KeyboardManager } from './KeyboardManager'
export { UndoManager } from './UndoManager'
export { Clipboard } from './clipboard/Clipboard'
export { DragManager } from './DragManager'
export { CrossBlockSelection } from './CrossBlockSelection'
export { ChangeNotifier } from './ChangeNotifier'
export { I18n } from './I18n'
export { BlockSettingsMenu } from './block-settings-menu/BlockSettingsMenu'
export { SlashCommands } from './SlashCommands'
export { Tooltip } from './Tooltip'
// Block plugins must be imported directly from their own entry points
// (e.g. `./plugins/paragraph/index`) to preserve tree-shaking.

export function createEditor(config: import('./types').EditorConfig): import('./EditorFacade').EditorFacade
export function createDefaultInlineTools(options?: { i18n?: import('./I18n').I18n, crossBlockSelection?: import('./types').ICrossBlockSelection }): import('./types').InlineTool[]
export function uid(): string
export function sanitizeHtml(html: string): string
export function escapeHtml(text: string): string

export { InlinePluginRegistry } from './InlinePluginRegistry'
export { createColorSwatchPlugin } from '../inline-plugins/color'
export { createMentionPlugin } from '../inline-plugins/mention'
export type {
  MentionItem,
  MentionSearchResult,
  MentionSearchFunction,
  MentionRenderItem,
  MentionRenderNoResults,
  MentionRenderLoading,
  MentionPluginOptions,
} from '../inline-plugins/mention'
