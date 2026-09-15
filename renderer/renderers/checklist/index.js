// @ts-check
import { mapChecklistTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = new URL('./styles.css', import.meta.url).href

/**
 * Checklist block renderer
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRenderer<import('../../types').ChecklistBlock>}
 */
export function createChecklistRenderer(classPrefix, _locale) {
  return {
    type: 'checklist',
    styles: [styles],
    mapTextFields,

    /**
     * @param {import('../../types').ChecklistBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline, context = { ownerDocument: globalThis.document }) {
      const { items } = block.data

      const ul = context.ownerDocument.createElement('ul')
      ul.className = `${classPrefix}-checklist`

      for (const item of items) {
        const li = context.ownerDocument.createElement('li')
        li.className = `${classPrefix}-checklist__item`

        if (item.checked) {
          li.classList.add(`${classPrefix}-checklist__item--checked`)
        }

        const checkbox = context.ownerDocument.createElement('span')
        checkbox.className = `${classPrefix}-checklist__checkbox`
        checkbox.setAttribute('role', 'checkbox')
        checkbox.setAttribute('aria-checked', String(item.checked))

        const content = context.ownerDocument.createElement('span')
        content.className = `${classPrefix}-checklist__text`
        content.appendChild(parseInline(item.text))

        li.appendChild(checkbox)
        li.appendChild(content)
        ul.appendChild(li)
      }

      return ul
    },
  }
}
