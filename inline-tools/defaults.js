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
 * @param {{ i18n?: import('../I18n').I18n, crossBlockSelection?: import('../types').ICrossBlockSelection }} [options]
 * @returns {import('../types').InlineTool[]}
 */
export function createDefaultInlineTools(options = {}) {
  const i18n = options.i18n
  const cbs = options.crossBlockSelection ?? null
  /** @param {import('../types').MessageKey} key @param {string} fallback @returns {string} */
  const t = (key, fallback) => i18n?.t(key) ?? fallback

  return [
    createBoldTool(t('inline.bold', 'Bold'), cbs),
    createItalicTool(t('inline.italic', 'Italic'), cbs),
    createStrikethroughTool(t('inline.strikethrough', 'Strikethrough'), cbs),
    createLinkTool(t('link.placeholder', 'Paste a link...'), t('inline.link', 'Link'), {
      apply: t('link.apply', 'Apply'),
      unlink: t('link.unlink', 'Unlink'),
    }, cbs),
    createCodeTool(t('inline.code', 'Inline Code'), cbs),
    createMarkerTool(t('inline.marker', 'Highlight'), cbs),
    createBgColorTool(t('inline.bgcolor', 'Background'), cbs),
    createFontSizeTool(t('inline.fontSize', 'Font size'), cbs),
    createScriptTool({
      sup: t('inline.superscript', 'Superscript'),
      sub: t('inline.subscript', 'Subscript'),
      none: t('inline.script.none', 'Normal'),
    }, cbs),
    createAlignTool({
      left: t('inline.align.left', 'Align left'),
      center: t('inline.align.center', 'Align center'),
      right: t('inline.align.right', 'Align right'),
      justify: t('inline.align.justify', 'Justify'),
    }, cbs),
    createCaseTransformTool(t('inline.case', 'Toggle case'), cbs),
    createClearFormattingTool(t('inline.clear', 'Clear formatting'), cbs),
  ]
}
