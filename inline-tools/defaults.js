import { createBoldTool } from './bold.js'
import { createItalicTool } from './italic.js'
import { createStrikethroughTool } from './strikethrough.js'
import { createLinkTool } from './link.js'
import { createCodeTool } from './code.js'
import { createMarkerTool } from './marker.js'
import { createBgColorTool } from './colorPicker.js'
import { createFontSizeTool } from './fontSize.js'
import { createAlignTool } from './align.js'
import { createScriptTool } from './scriptTool.js'
import { createCaseTransformTool } from './caseTransform.js'
import { createClearFormattingTool } from './clearFormatting.js'

/**
 * Create the default set of inline tools.
 * @param {{ i18n?: import('../I18n').I18n, crossBlockSelection?: import('../types').ICrossBlockSelection, types?: string[] }} [options]
 * @returns {import('../types').InlineTool[]}
 */
export function createDefaultInlineTools(options = {}) {
  const i18n = options.i18n
  const cbs = options.crossBlockSelection ?? null
  /** @param {import('../types').MessageKey} key @param {string} fallback @returns {string} */
  const t = (key, fallback) => i18n?.t(key) ?? fallback

  /** @type {Array<[string, () => import('../types').InlineTool]>} */
  const factories = [
    ['bold', () => createBoldTool(t('inline.bold', 'Bold'), cbs)],
    ['italic', () => createItalicTool(t('inline.italic', 'Italic'), cbs)],
    ['strikethrough', () => createStrikethroughTool(t('inline.strikethrough', 'Strikethrough'), cbs)],
    ['link', () => createLinkTool(t('link.placeholder', 'Paste a link...'), t('inline.link', 'Link'), {
      apply: t('link.apply', 'Apply'),
      unlink: t('link.unlink', 'Unlink'),
    }, cbs)],
    ['code', () => createCodeTool(t('inline.code', 'Inline Code'), cbs)],
    ['marker', () => createMarkerTool(t('inline.marker', 'Highlight'), cbs)],
    ['bgcolor', () => createBgColorTool(t('inline.bgcolor', 'Background'), cbs)],
    ['fontSize', () => createFontSizeTool(t('inline.fontSize', 'Font size'), cbs)],
    ['script', () => createScriptTool({
      sup: t('inline.superscript', 'Superscript'),
      sub: t('inline.subscript', 'Subscript'),
      none: t('inline.script.none', 'Normal'),
    }, cbs)],
    ['align', () => createAlignTool({
      left: t('inline.align.left', 'Align left'),
      center: t('inline.align.center', 'Align center'),
      right: t('inline.align.right', 'Align right'),
      justify: t('inline.align.justify', 'Justify'),
    }, cbs)],
    ['caseTransform', () => createCaseTransformTool(t('inline.case', 'Toggle case'), cbs)],
    ['clearFormatting', () => createClearFormattingTool(t('inline.clear', 'Clear formatting'), cbs)],
  ]

  const requested = options.types ? new Set(options.types) : null
  return factories
    .filter(([type]) => !requested || requested.has(type))
    .map(([, create]) => create())
}
