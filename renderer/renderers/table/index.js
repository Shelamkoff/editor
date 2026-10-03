// @ts-check
import { mapTableTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = new URL('./styles.css', import.meta.url).href

/**
 * Table block renderer
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRenderer<import('../../types').TableBlock>}
 */
export function createTableRenderer(classPrefix, _locale) {
  return {
    type: 'table',
    styles: [styles],
    mapTextFields,

    /**
     * @param {import('../../types').TableBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline, context = { ownerDocument: globalThis.document }) {
      const { rows, withHeadings = false } = block.data

      const wrapper = context.ownerDocument.createElement('div')
      wrapper.className = `${classPrefix}-table-wrapper`

      const table = context.ownerDocument.createElement('table')
      table.className = `${classPrefix}-table`

      const startIndex = withHeadings ? 1 : 0

      // Render header row
      if (withHeadings && rows[0]) {
        const thead = context.ownerDocument.createElement('thead')
        thead.className = `${classPrefix}-table__head`

        const headerRow = context.ownerDocument.createElement('tr')
        headerRow.className = `${classPrefix}-table__row`

        for (const cell of rows[0].cells) {
          const th = context.ownerDocument.createElement('th')
          th.className = `${classPrefix}-table__header`
          th.appendChild(parseInline(cell.text))
          headerRow.appendChild(th)
        }

        thead.appendChild(headerRow)
        table.appendChild(thead)
      }

      // Render body rows
      if (rows.length > startIndex) {
        const tbody = context.ownerDocument.createElement('tbody')
        tbody.className = `${classPrefix}-table__body`

        for (let i = startIndex; i < rows.length; i++) {
          const rowData = rows[i]
          if (!rowData) continue
          const row = context.ownerDocument.createElement('tr')
          row.className = `${classPrefix}-table__row`

          for (const cell of rowData.cells) {
            const td = context.ownerDocument.createElement('td')
            td.className = `${classPrefix}-table__cell`
            td.appendChild(parseInline(cell.text))
            row.appendChild(td)
          }

          tbody.appendChild(row)
        }

        table.appendChild(tbody)
      }

      wrapper.appendChild(table)

      return wrapper
    },
  }
}
