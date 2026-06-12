// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'

const styles = resolvePath('./styles.css', import.meta.url)

/**
 * Poll block renderer
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').PollBlock>}
 */
export function createPollRenderer(classPrefix, _locale) {
    return {
        type: 'poll',
        styles: [styles],

        /**
         * @param {import('../../types').PollBlock} block
         * @param {import('../../types').InlineParser} parseInline
         * @returns {HTMLElement}
         */
        render(block, parseInline) {
            const { question, type, options } = block.data

            const wrapper = document.createElement('div')
            wrapper.className = `${classPrefix}-poll`

            // Question
            if (question) {
                const questionEl = document.createElement('div')
                questionEl.className = `${classPrefix}-poll__question`
                questionEl.appendChild(parseInline(question))
                wrapper.appendChild(questionEl)
            }

            // Options
            const totalVotes = options.reduce((sum, o) => sum + (o.votes || 0), 0)

            const optionsEl = document.createElement('div')
            optionsEl.className = `${classPrefix}-poll__options`

            for (const option of options) {
                const row = document.createElement('div')
                row.className = `${classPrefix}-poll__option`

                // Marker
                const marker = document.createElement('span')
                marker.className = `${classPrefix}-poll__marker ${classPrefix}-poll__marker--${type || 'single'}`
                row.appendChild(marker)

                // Text + bar
                const content = document.createElement('div')
                content.className = `${classPrefix}-poll__option-content`

                const text = document.createElement('span')
                text.className = `${classPrefix}-poll__option-text`
                if (option.text) text.appendChild(parseInline(option.text))
                content.appendChild(text)

                // Progress bar
                const pct = totalVotes > 0 ? Math.round(((option.votes || 0) / totalVotes) * 100) : 0

                const bar = document.createElement('div')
                bar.className = `${classPrefix}-poll__bar`

                const fill = document.createElement('div')
                fill.className = `${classPrefix}-poll__bar-fill`
                fill.style.width = `${pct}%`
                bar.appendChild(fill)

                const pctLabel = document.createElement('span')
                pctLabel.className = `${classPrefix}-poll__pct`
                pctLabel.textContent = `${pct}%`

                content.append(bar, pctLabel)
                row.appendChild(content)
                optionsEl.appendChild(row)
            }

            wrapper.appendChild(optionsEl)

            return wrapper
        },
    }
}
