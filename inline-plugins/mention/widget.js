// @ts-check
import { mentionWidgetSchema } from '../../shared/inlineSchemas/mention.js'

const STYLES_URL = new URL('./styles.css', import.meta.url).href

/**
 * Create a read-only mention renderer that shares the editor widget schema.
 * @param {string} [trigger='@'] Presentation trigger used before the mention label.
 * @returns {import('../../renderer/types').InlineWidgetRenderer<{id:string,name:string}>}
 */
export function createMentionRenderer(trigger = '@') {
  if (typeof trigger !== 'string' || Array.from(trigger).length !== 1) {
    throw new TypeError('Mention renderer trigger must be exactly one Unicode code point')
  }
  return Object.freeze({
    type: 'mention',
    styles: Object.freeze([STYLES_URL]),
    schema: mentionWidgetSchema,
    render(id, data, context) {
      const span = context.ownerDocument.createElement('span')
      span.className = 'oe-ip oe-ip--mention'
      span.dataset.value = data.id
      span.textContent = trigger + data.name
      span.tabIndex = -1
      return span
    },
  })
}
