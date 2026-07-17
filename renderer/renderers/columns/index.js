// @ts-check
import { mapColumnsTextFields as mapTextFields } from '../../../shared/mapTextFields.js'

const styles = new URL('./styles.css', import.meta.url).href

/** @type {Record<string, string>} */
const LAYOUT_GRIDS = {
    '1-1': '1fr 1fr',
    '1-2': '1fr 2fr',
    '2-1': '2fr 1fr',
    '1-1-1': '1fr 1fr 1fr',
}

/**
 * Columns layout block renderer
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} _locale
 * @returns {import('../../types').BlockRenderer<import('../../types').ColumnsBlock>}
 */
export function createColumnsRenderer(classPrefix, _locale) {
    return {
        type: 'columns',
        styles: [styles],
        mapTextFields,

        /**
         * @param {import('../../types').ColumnsBlock} block
         * @param {import('../../types').InlineParser} parseInline
         * @returns {HTMLElement}
         */
        render(block, parseInline) {
            const { columns, layout } = block.data

            const wrapper = document.createElement('div')
            wrapper.className = `${classPrefix}-columns`
            wrapper.style.display = 'grid'
            wrapper.style.gridTemplateColumns = LAYOUT_GRIDS[layout] || '1fr 1fr'
            wrapper.style.gap = '1rem'

            for (const col of columns) {
                const colEl = document.createElement('div')
                colEl.className = `${classPrefix}-columns__col`
                if (col.content) {
                    colEl.appendChild(parseInline(col.content))
                }
                wrapper.appendChild(colEl)
            }

            return wrapper
        },
    }
}
