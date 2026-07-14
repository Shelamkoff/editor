// @ts-check
import { highlightCode, loadHighlightRuntime } from '../shared/highlightRuntime.js'
import { parseInline } from '../shared/sanitize/parseInline.js'

/**
 * Apply highlighting immediately when available, otherwise enhance the
 * already-safe text node after the shared lazy runtime finishes loading.
 * @param {HTMLElement} element
 * @param {string} text
 * @param {string} language
 */
function highlightElement(element, text, language) {
  const apply = () => {
    const result = highlightCode(text, language)
    if (!result) return false
    element.innerHTML = result.value
    return true
  }

  if (apply()) return
  element.textContent = text
  void loadHighlightRuntime().then(apply).catch(() => {
    element.textContent = text
  })
}

/**
 * Upgrade code elements that represent block code (contain newlines)
 * with syntax highlighting. Mutates the fragment in place.
 *
 * Inline code (single line) is left as-is. It was already sanitized by
 * parseInline and keeps its class/lang attributes.
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
      highlightElement(el, text, lang)
    } else {
      el.textContent = text
    }
  }
}

/**
 * Create inline parser function.
 * @returns {import('./types').InlineParser}
 */
export function createInlineParser(_classPrefix) {
  return (/** @type {string} */ text) => {
    const fragment = parseInline(text)
    upgradeCodeBlocks(fragment)
    return fragment
  }
}
