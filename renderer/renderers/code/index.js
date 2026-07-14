// @ts-check
import {
    getHighlightRuntime,
    highlightCode as highlightWithRuntime,
    loadHighlightRuntime,
} from '../../../shared/highlightRuntime.js'
import { escapeHtml } from '../../../shared/sanitize/escapeHtml.js'
import { resolvePath } from '../../../shared/resolvePath.js'

const styles = resolvePath('./styles.css', import.meta.url)


/**
 * Highlight code with syntax highlighting
 * @param {string} code
 * @param {string} [language]
 * @returns {{ value: string; language: string }}
 */
function highlightCode(code, language) {
    const highlighted = highlightWithRuntime(code, language)
    if (highlighted) return highlighted
    return {
        value: escapeHtml(code),
        language: language && language !== 'auto' ? language : 'plaintext',
    }
}
// Tabler icons for copy button
const ICON_CLIPBOARD = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2h-2"/><path d="M9 3m0 2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/></svg>`
const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10-10"/></svg>`

/**
 * Code block renderer with syntax highlighting
 * Uses highlight.js for syntax highlighting with auto-detection
 * @see https://highlightjs.org/
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').CodeBlock>}
 */
export function createCodeRenderer(classPrefix, /** @type {Record<string, import('../../../shared/localeTypes').LocaleValue>} */ locale) {
    const t = (/** @type {string} */ key, /** @type {string} */ fallback) => {
        const value = locale?.[key]
        return typeof value === 'string' ? value : fallback
    }
    return {
        type: 'code',
        styles: [styles],

        /**
         * @param {import('../../types').CodeBlock} block
         * @param {import('../../types').InlineParser} _parseInline
         * @returns {HTMLElement}
         */
        render(block, _parseInline) {
            const { code, language } = block.data

            const wrapper = document.createElement('div')
            wrapper.className = `${classPrefix}-code`

            const highlighted = highlightCode(code, language)

            // Top bar: language label + copy button
            const bar = document.createElement('div')
            bar.className = `${classPrefix}-code__bar`

            const langLabel = document.createElement('span')
            langLabel.className = `${classPrefix}-code__lang`
            langLabel.textContent = (highlighted.language && highlighted.language !== 'plaintext') ? highlighted.language : ''
            bar.appendChild(langLabel)

            const copyBtn = document.createElement('button')
            copyBtn.type = 'button'
            copyBtn.className = `${classPrefix}-code__copy`
            copyBtn.innerHTML = ICON_CLIPBOARD
            copyBtn.title = t('renderer.code.copy', 'Copy code')

            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(code)
                    copyBtn.innerHTML = ICON_CHECK
                    copyBtn.classList.add(`${classPrefix}-code__copy--success`)

                    setTimeout(() => {
                        copyBtn.innerHTML = ICON_CLIPBOARD
                        copyBtn.classList.remove(`${classPrefix}-code__copy--success`)
                    }, 2000)
                } catch {
                    // Clipboard API unavailable (HTTP without localhost)
                }
            })

            bar.appendChild(copyBtn)
            wrapper.appendChild(bar)

            // Code content
            const pre = document.createElement('pre')
            pre.className = `${classPrefix}-code__pre`

            const codeElement = document.createElement('code')
            codeElement.className = `${classPrefix}-code__content hljs language-${highlighted.language}`
            codeElement.innerHTML = highlighted.value

            if (!getHighlightRuntime()) {
                void loadHighlightRuntime().then(() => {
                    const loaded = highlightCode(code, language)
                    langLabel.textContent = (loaded.language && loaded.language !== 'plaintext') ? loaded.language : ''
                    codeElement.className = classPrefix + '-code__content hljs language-' + loaded.language
                    codeElement.innerHTML = loaded.value
                }).catch(() => {
                    // Safe escaped fallback is already rendered.
                })
            }

            pre.appendChild(codeElement)
            wrapper.appendChild(pre)

            return wrapper
        },
    }
}
