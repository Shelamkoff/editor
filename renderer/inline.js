// @ts-check
import { highlightCode, loadHighlightRuntime } from '../shared/highlightRuntime.js'
import { parseInline } from '../shared/sanitize/parseInline.js'
import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'

/**
 * Apply highlighting immediately when available, otherwise enhance the
 * already-safe text node after the shared lazy runtime finishes loading.
 * @param {HTMLElement} element
 * @param {string} text
 * @param {string} language
 */
function highlightElement(element, text, language) {
  const apply = () => {
    // The lazy highlighter may settle after another render or author action
    // has repurposed this node. Never rewrite newer code with an old snapshot.
    if (element.textContent !== text) return false
    const result = highlightCode(text, language)
    if (!result || element.textContent !== text) return false
    // highlight.js escapes source text and returns library-owned markup.
    setTrustedHtml(element, result.value)
    return true
  }

  if (apply()) return
  if (element.textContent !== text) return
  element.textContent = text
  // Plain source text is already available. Failed loading must not restore
  // this obsolete snapshot over a newer owner of the same DOM node.
  void loadHighlightRuntime().then(apply).catch(() => {})
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
 * @param {Document} [ownerDocument]
 * @returns {import('./types').InlineParser}
 */
export function createInlineParser(_classPrefix, ownerDocument = globalThis.document) {
  return (/** @type {string} */ text) => {
    const fragment = parseInline(text, ownerDocument)
    upgradeCodeBlocks(fragment)
    return fragment
  }
}
