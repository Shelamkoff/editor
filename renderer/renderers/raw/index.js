// @ts-check
import { rawDataSchema } from '../../../shared/blockSchemas/raw.js'
import { mountEmbeddedHtml } from '../../../shared/embeddedHtml.js'
import { localeText } from '../locale.js'

/**
 * Raw HTML block renderer
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRendererDefinition<import('../../../shared/blockDataTypes.js').RawBlock>}
 */
export function createRawRenderer(classPrefix, _locale) {
  /** @type {WeakMap<HTMLElement, {destroy():void}>} */
  const projections = new WeakMap()
  return {
    type: 'raw',
    schema: rawDataSchema,
    styles: [],

    /**
     * @param {import('../../../shared/blockDataTypes.js').RawBlock} block
     * @param {import('../../types').InlineParser} _parseInline
     * @returns {HTMLElement}
     */
    render(block, _parseInline, context = { ownerDocument: globalThis.document }) {
      const wrapper = context.ownerDocument.createElement('div')
      wrapper.className = `${classPrefix}-raw`
      projections.set(wrapper, mountEmbeddedHtml(wrapper, block.data.html, {
        contentStyles: context.contentStyles,
        title: localeText(_locale, 'renderer.raw.content', 'HTML content'),
      }))
      return wrapper
    },
    destroy(element) { projections.get(element)?.destroy(); projections.delete(element) },
  }
}
