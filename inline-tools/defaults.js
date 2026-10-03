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
 * @param {{ i18n?: import('../I18n').I18n, types?: string[] }} [options]
 * @returns {import('./types').InlineTool[]}
 */
export function createDefaultInlineTools(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('inline tool options must be an object')
  }
  const ownOptions = { ...options }
  const i18n = ownOptions.i18n
  /** @param {string} key @param {string} fallback @returns {string} */
  const t = (key, fallback) => i18n?.t(key) ?? fallback

  /** @type {Array<[string, () => import('./types').InlineTool]>} */
  const factories = [
    ['bold', () => createBoldTool(t('inline.bold', 'Bold'))],
    ['italic', () => createItalicTool(t('inline.italic', 'Italic'))],
    ['strikethrough', () => createStrikethroughTool(t('inline.strikethrough', 'Strikethrough'))],
    ['link', () => createLinkTool(t('link.placeholder', 'Paste a link...'), t('inline.link', 'Link'), {
      apply: t('link.apply', 'Apply'),
      unlink: t('link.unlink', 'Unlink'),
    })],
    ['code', () => createCodeTool(t('inline.code', 'Inline Code'))],
    ['marker', () => createMarkerTool(t('inline.marker', 'Highlight'))],
    ['bgcolor', () => createBgColorTool(t('inline.bgcolor', 'Background'))],
    ['fontSize', () => createFontSizeTool(t('inline.fontSize', 'Font size'))],
    ['script', () => createScriptTool({
      sup: t('inline.superscript', 'Superscript'),
      sub: t('inline.subscript', 'Subscript'),
      none: t('inline.script.none', 'Normal'),
    })],
    ['align', () => createAlignTool({
      left: t('inline.align.left', 'Align left'),
      center: t('inline.align.center', 'Align center'),
      right: t('inline.align.right', 'Align right'),
      justify: t('inline.align.justify', 'Justify'),
    })],
    ['caseTransform', () => createCaseTransformTool(t('inline.case', 'Toggle case'))],
    ['clearFormatting', () => createClearFormattingTool(t('inline.clear', 'Clear formatting'))],
  ]

  const explicitTypes = ownOptions.types
  if (explicitTypes !== undefined) {
    if (!Array.isArray(explicitTypes)) throw new TypeError('types must be an array')
    for (let index = 0; index < explicitTypes.length; index++) {
      if (!Object.hasOwn(explicitTypes, index)) throw new TypeError('types must be a dense array')
    }
  }
  const requested = explicitTypes ? new Set(explicitTypes) : null
  return factories
    .filter(([type]) => !requested || requested.has(type))
    .map(([, create]) => create())
}
