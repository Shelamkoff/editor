// @ts-check
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import hljsCss from 'highlight.js/lib/languages/css'
import php from 'highlight.js/lib/languages/php'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import csharp from 'highlight.js/lib/languages/csharp'
import plaintext from 'highlight.js/lib/languages/plaintext'
import { resolvePath } from '../../../shared/resolvePath.js'

const styles = resolvePath('./styles.css', import.meta.url)

// Register languages
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('vue', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', hljsCss)
hljs.registerLanguage('php', php)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('cs', csharp)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('text', plaintext)

/**
 * Escape HTML special characters
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    /** @type {Record<string, string>} */
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    }
    return text.replace(/[&<>"']/g, char => map[char] ?? char)
}

/**
 * Highlight code with syntax highlighting
 * @param {string} code
 * @param {string} [language]
 * @returns {{ value: string; language: string }}
 */
function highlightCode(code, language) {
    try {
        if (language && hljs.getLanguage(language)) {
            const result = hljs.highlight(code, { language, ignoreIllegals: true })
            return { value: result.value, language }
        }

        // Auto-detect language
        const result = hljs.highlightAuto(code)
        return { value: result.value, language: result.language || 'plaintext' }
    } catch {
        return { value: escapeHtml(code), language: 'plaintext' }
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
export function createCodeRenderer(classPrefix, /** @type {Record<string, string>} */ locale) {
    const t = (/** @type {string} */ key, /** @type {string} */ fallback) => locale?.[key] ?? fallback
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

            pre.appendChild(codeElement)
            wrapper.appendChild(pre)

            return wrapper
        },
    }
}
