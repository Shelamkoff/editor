/** Default block type used when no explicit default is configured. */
export const DEFAULT_BLOCK_TYPE = 'paragraph'

export const DEFAULT_THEME = 'dark'

/** CSS class applied to every block wrapper element. */
export const BLOCK_CLASS = 'oe-block'

/** CSS selector for block wrapper elements (`.oe-block`). */
export const BLOCK_SELECTOR = '.oe-block'

export { READ_ONLY_INTERACTIVE_ATTRIBUTE } from '../shared/extensionConstants.js'

/**
 * Internal marker used by the alignment tool and Block serializer. The value
 * mirrors the canonical `tunes.textAlign` setting; an empty value explicitly
 * removes that setting.
 */
export const TEXT_ALIGN_TUNE_ATTRIBUTE = 'data-oe-text-align-tune'

/** Editor document format version — shared by EditorFacade.save() and UndoManager. */
export const EDITOR_VERSION = '2.0.0'

/** Duration of the offcanvas slide/backdrop-fade animation (ms). */
export const OFFCANVAS_ANIMATION_MS = 250
