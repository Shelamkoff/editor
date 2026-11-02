// @ts-check
import { AUTHOR_CLASS_NAMESPACE, CONTENT_STYLE_OWNER, CONTENT_STYLE_FIELD } from './sanitize/contentClasses.js'
import { rewriteContentClassSelectors } from './contentClassSelectors.js'

export { CONTENT_STYLE_OWNER, CONTENT_STYLE_FIELD } from './sanitize/contentClasses.js'
export function createContentStyleScope() {
  // Separate installed/bundled copies have independent module counters. Their
  // content owners must still never share a selector identity in one Document.
  const words = globalThis.crypto.getRandomValues(new Uint32Array(4))
  return Object.freeze({ id: `rector-content-${Array.from(words, word => word.toString(36)).join('-')}` })
}

/** The native CSSOM has already parsed and balanced this rule's prelude.
 * @param {string} text
 */
function prelude(text) {
  let parentheses = 0, brackets = 0, quote = ''
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (character === '\\') { index++; continue }
    if (quote) { if (character === quote) quote = ''; continue }
    if (character === '"' || character === "'") { quote = character; continue }
    if (character === '(') parentheses++
    else if (character === ')') parentheses--
    else if (character === '[') brackets++
    else if (character === ']') brackets--
    else if (character === '{' && !parentheses && !brackets) return text.slice(0, index)
  }
  throw new TypeError('CSS grouping rule has no balanced prelude')
}

/** Compile each self-contained application sheet independently. Native CSS
 * retains declarations, conditions, fonts, animations and variable semantics.
 * Only author class identity and the permitted content scope change.
 * @param {readonly string[]} sources
 * @param {Document} ownerDocument
 * @param {{id:string}} scope
 * @returns {CSSStyleSheet[]}
 */
export function compileContentClassSheets(sources, ownerDocument, scope) {
  const Ctor = ownerDocument.defaultView?.CSSStyleSheet
  if (!Ctor) throw new TypeError('Content styles require an active owning document with CSSStyleSheet support')
  const owner = `[${CONTENT_STYLE_OWNER}="${scope.id}"]`, field = `[${CONTENT_STYLE_FIELD}="${scope.id}"]`
  const scopeSelector = `${owner} ${field}, ${owner}${field}`
  return sources.map(source => {
    const parsed = new Ctor(); parsed.replaceSync(source)
    const namespaces = [], body = [], prefixes = new Set()
    for (const rule of Array.from(parsed.cssRules)) {
      if (rule.type === 10) {
        const namespace = /** @type {CSSNamespaceRule} */ (rule)
        namespaces.push(rule.cssText); prefixes.add(namespace.prefix)
      } else body.push(rule.cssText)
    }
    let prefix = 'rectorContent'
    while (prefixes.has(prefix)) prefix += '_'
    const header = namespaces.join('\n') + `\n@namespace ${prefix} url("${AUTHOR_CLASS_NAMESPACE}");\n`
    const admitted = new Ctor(); admitted.replaceSync(header + body.join('\n'))
    /** @param {CSSRule} rule @returns {string} */
    const serialize = rule => {
      if (rule.type === 1) {
        const style = /** @type {CSSStyleRule} */ (rule)
        return `${rewriteContentClassSelectors(style.selectorText, prefix)}{${style.style.cssText}${Array.from(style.cssRules ?? [], serialize).join('\n')}}`
      }
      if ('cssRules' in rule) {
        const grouping = /** @type {CSSGroupingRule} */ (rule)
        let header = prelude(rule.cssText)
        if (rule.cssText.startsWith('@scope')) {
          const scoped = /** @type {CSSScopeRule} */ (rule)
          header = '@scope' + (scoped.start ? ` (${rewriteContentClassSelectors(scoped.start, prefix)})` : '')
            + (scoped.end ? ` to (${rewriteContentClassSelectors(scoped.end, prefix)})` : '')
        }
        return `${header}{${Array.from(grouping.cssRules, serialize).join('\n')}}`
      }
      return rule.cssText
    }
    const rules = Array.from(admitted.cssRules).filter(rule => rule.type !== 10).map(serialize).join('\n')
    const sheet = new Ctor()
    sheet.replaceSync(header + `@scope (${scopeSelector}) to ([data-inline-plugin]){${rules}}`)
    return sheet
  })
}
