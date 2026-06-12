// @ts-check
/**
 * Minimal HTML sanitizer — strips script/style tags and event handlers.
 * @param {string} html
 * @returns {string}
 */
function sanitize(html) {
  const temp = document.createElement('div')
  temp.innerHTML = html
  for (const el of temp.querySelectorAll('script, style, iframe, object, embed, form, meta, link, base')) el.remove()
  for (const el of temp.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const val = attr.value.trim().toLowerCase()
      if (name.startsWith('on') || val.startsWith('javascript:') || val.startsWith('data:text/html')) {
        el.removeAttribute(attr.name)
      }
    }
  }
  return temp.innerHTML
}

/**
 * Raw HTML block renderer
 * @param {string} classPrefix
 * @returns {import('../../types').BlockRenderer<import('../../types').RawBlock>}
 */
export function createRawRenderer(classPrefix, _locale) {
  return {
    type: 'raw',
    styles: [],

    /**
     * @param {import('../../types').RawBlock} block
     * @param {import('../../types').InlineParser} _parseInline
     * @returns {HTMLElement}
     */
    render(block, _parseInline) {
      const wrapper = document.createElement('div')
      wrapper.className = `${classPrefix}-raw`
      wrapper.innerHTML = sanitize(block.data.html)
      return wrapper
    },
  }
}
