// @ts-check
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import php from 'highlight.js/lib/languages/php'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import csharp from 'highlight.js/lib/languages/csharp'
import plaintext from 'highlight.js/lib/languages/plaintext'
import cpp from 'highlight.js/lib/languages/cpp'
import ruby from 'highlight.js/lib/languages/ruby'
import swift from 'highlight.js/lib/languages/swift'
import kotlin from 'highlight.js/lib/languages/kotlin'
import yaml from 'highlight.js/lib/languages/yaml'

import { parseInline, escapeHtml } from '../shared/sanitize/index.js'

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
hljs.registerLanguage('css', css)
hljs.registerLanguage('php', php)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('cs', csharp)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c++', cpp)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('text', plaintext)

/**
 * Highlight code with syntax highlighting
 * @param {string} code
 * @param {string} [language]
 * @returns {string}
 */
function highlightCode(code, language) {
  try {
    if (language && hljs.getLanguage(language)) {
      const result = hljs.highlight(code, { language, ignoreIllegals: true })
      return result.value
    }
    const result = hljs.highlightAuto(code)
    return result.value
  } catch {
    return escapeHtml(code)
  }
}

/**
 * Upgrade `<code>` elements that represent block code (contain newlines)
 * with syntax highlighting. Mutates the fragment in place.
 *
 * Inline `<code>` (single line) is left as-is — it was already sanitized
 * by `parseInline` and keeps its class/lang attributes.
 *
 * @param {DocumentFragment | HTMLElement} root
 */
function upgradeCodeBlocks(root) {
  const codeEls = root.querySelectorAll('code')
  for (const el of codeEls) {
    const text = el.textContent || ''
    if (!text.includes('\n')) continue

    const lang = el.getAttribute('lang')
    if (lang) {
      el.innerHTML = highlightCode(text, lang)
    } else {
      el.textContent = text
    }
  }
}

/**
 * Create inline parser function
 * @returns {import('./types').InlineParser}
 */
export function createInlineParser(_classPrefix) {
  return (/** @type {string} */ text) => {
    const fragment = parseInline(text)
    upgradeCodeBlocks(fragment)
    return fragment
  }
}