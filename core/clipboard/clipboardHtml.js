import { sanitizeHtml } from '../sanitize.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'

/** Export inline content without editor state or controls.
 * @param {Element} source
 */
function inline(source) {
  const template = document.createElement('template')
  template.innerHTML = source.innerHTML
  for (const control of template.content.querySelectorAll('button, input, textarea, select, script, style, svg, [role="menu"], [role="dialog"]')) control.remove()
  const result = document.createElement('span')
  result.innerHTML = sanitizeHtml(template.innerHTML)
  for (const node of result.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith('data-') || attribute.name === 'contenteditable' || attribute.name === 'class') node.removeAttribute(attribute.name)
    }
  }
  return result.innerHTML
}

/** @param {string} tag @param {Element} source */
function field(tag, source) {
  const element = document.createElement(tag)
  element.innerHTML = inline(source)
  return element
}

/** @param {Element} source */
function list(source) {
  const result = document.createElement(source.tagName.toLowerCase() === 'ol' ? 'ol' : 'ul')
  for (const item of source.children) {
    if (item.tagName !== 'LI') continue
    const template = document.createElement('template')
    template.innerHTML = item.innerHTML
    const nested = [...template.content.querySelectorAll('ul, ol')].filter(node => !node.parentElement?.closest('ul, ol'))
    for (const node of nested) node.remove()
    const holder = document.createElement('div')
    holder.innerHTML = template.innerHTML
    const li = field('li', holder)
    for (const node of nested) li.appendChild(list(node))
    result.appendChild(li)
  }
  return result
}

/** A semantic, noninteractive fallback for external applications.
 * The internal MIME payload remains the lossless document representation.
 * @param {import('../types').IBlock} block
 * @returns {string}
 */
export function blockClipboardHtml(block) {
  const root = block.contentElement
  if (block.type === 'delimiter') return '<hr>'
  if (block.type === 'image') {
    const data = /** @type {{ file?: { url?: string }, caption?: string }} */ (block.save().data)
    // Build in inert content: exporting must not load media or preserve UI.
    const template = document.createElement('template')
    template.innerHTML = '<figure><img></figure>'
    const figure = template.content.firstElementChild
    const image = figure.querySelector('img')
    const url = sanitizeMediaUrl(data.file?.url)
    if (url) image.setAttribute('src', url)
    const captionSource = document.createElement('template')
    captionSource.innerHTML = typeof data.caption === 'string' ? data.caption : ''
    const caption = field('figcaption', captionSource)
    image.setAttribute('alt', caption.textContent || '')
    if (caption.innerHTML) figure.appendChild(caption)
    return figure.outerHTML
  }
  if (root.matches('p, h1, h2, h3, h4, h5, h6')) return field(root.tagName.toLowerCase(), root).outerHTML
  if (block.type === 'quote') {
    const quote = field('blockquote', root.querySelector('blockquote') || root)
    const caption = root.querySelector('cite')
    if (caption?.textContent) quote.appendChild(field('cite', caption))
    return quote.outerHTML
  }
  if (block.type === 'code' || block.type === 'raw') {
    const data = block.save().data
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = String(data.code ?? data.html ?? '')
    pre.appendChild(code)
    return pre.outerHTML
  }
  const listRoot = root.matches('ul, ol') ? root : null
  if (listRoot) return list(listRoot).outerHTML
  const tableRoot = root.matches('table') ? root : root.querySelector('table')
  if (tableRoot) {
    const table = document.createElement('table')
    for (const row of tableRoot.querySelectorAll('tr')) {
      const tr = document.createElement('tr')
      for (const cell of row.children) if (cell.matches('td, th')) tr.appendChild(field(cell.tagName.toLowerCase(), cell))
      table.appendChild(tr)
    }
    return table.outerHTML
  }
  // Custom/composite plugins contribute authored fields, not toolbar DOM.
  const fields = root.matches('[contenteditable="true"]') ? [root] : [...root.querySelectorAll('[contenteditable="true"]')]
  return fields.length ? fields.map(source => field('p', source).outerHTML).join('\n') : field('p', root).outerHTML
}
