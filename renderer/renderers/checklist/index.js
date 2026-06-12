// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'
import { mapTextFields } from '../../../plugins/checklist/mapTextFields.js'

const styles = resolvePath('./styles.css', import.meta.url)

/**
 * Checklist block renderer
 * @param {string} classPrefix
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
    render(block, parseInline) {
      const { items } = block.data

      const ul = document.createElement('ul')
      ul.className = `${classPrefix}-checklist`

      for (const item of items) {
        const li = document.createElement('li')
        li.className = `${classPrefix}-checklist__item`

        if (item.checked) {
          li.classList.add(`${classPrefix}-checklist__item--checked`)
        }

        const checkbox = document.createElement('span')
        checkbox.className = `${classPrefix}-checklist__checkbox`
        checkbox.setAttribute('role', 'checkbox')
        checkbox.setAttribute('aria-checked', String(item.checked))

        const content = document.createElement('span')
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
