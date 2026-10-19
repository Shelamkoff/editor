// @ts-check
import { findNodeAtOffset, getTextLength, getTextOffset } from './textOffset.js'
import { normalizeRichText } from './richTextCodec.js'
import { toTrustedHtml } from './sanitize/trustedHtml.js'

const PLACEHOLDER_RE=/\{\{([A-Za-z0-9_-]+)\}\}/g
const MARKER_ATTR='data-oe-inline-reference'

/** Sanitizer-preserved author text boundary for a placeholder-shaped literal
 * that happens to share an ID with a real inline widget. */
export const INLINE_LITERAL_CLASS = 'oe-inline-literal'

/** @param {Node} node */
function isLiteralInlineText(node) {
  return Boolean(node.parentElement?.closest?.('span.' + INLINE_LITERAL_CLASS))
}

/** Preserve literal "{{id}}" characters separately from actual inline
 * references, without a new document envelope or visible formatting.
 * @param {Node} root
 * @param {Iterable<string>} ids
 * @param {Document} ownerDocument
 */
export function protectInlineLiteralTokens(root, ids, ownerDocument) {
  const reserved=new Set(ids)
  if(!reserved.size)return
  const walker=ownerDocument.createTreeWalker(root,4)
  /** @type {Text[]} */
  const nodes=[]
  for(let node=walker.nextNode();node;node=walker.nextNode()) {
    if(!isLiteralInlineText(node))nodes.push(/** @type {Text} */ (node))
  }
  for(const text of nodes){
    if(!text.data.includes('{{'))continue
    let cursor=0,changed=false
    const fragment=ownerDocument.createDocumentFragment()
    for(const match of richTextPlaceholderMatches(text.data)){
      if(!reserved.has(match[1]))continue
      if(match.index>cursor)fragment.appendChild(
        ownerDocument.createTextNode(text.data.slice(cursor,match.index)),
      )
      const literal=ownerDocument.createElement('span')
      literal.className=INLINE_LITERAL_CLASS
      literal.textContent=match[0]
      fragment.appendChild(literal)
      cursor=match.index+match[0].length
      changed=true
    }
    if(!changed)continue
    if(cursor<text.data.length)fragment.appendChild(ownerDocument.createTextNode(text.data.slice(cursor)))
    text.replaceWith(fragment)
  }
}

/** Iterate the canonical placeholder grammar in a text node, never raw HTML. */
export function richTextPlaceholderMatches(text){
  return String(text??'').matchAll(PLACEHOLDER_RE)
}

function ownInline(inline){
  return inline&&typeof inline==='object'&&!Array.isArray(inline)?inline:{}
}

function expandReferences(root,inline,ownerDocument){
  const textNodes=[]
  const walker=ownerDocument.createTreeWalker(root,4)
  let node=walker.nextNode()
  while(node){textNodes.push(/** @type {Text} */(node));node=walker.nextNode()}
  for(const text of textNodes){
    if(isLiteralInlineText(text)||!text.data.includes('{{'))continue
    const fragment=ownerDocument.createDocumentFragment()
    let cursor=0
    let changed=false
    for(const match of richTextPlaceholderMatches(text.data)){
      const id=match[1]
      if(!Object.hasOwn(inline,id))continue
      if(match.index>cursor)fragment.appendChild(ownerDocument.createTextNode(text.data.slice(cursor,match.index)))
      const marker=ownerDocument.createElement('span')
      marker.setAttribute('data-inline-plugin','__reference__')
      marker.setAttribute(MARKER_ATTR,id)
      marker.contentEditable='false'
      fragment.appendChild(marker)
      cursor=match.index+match[0].length
      changed=true
    }
    if(!changed)continue
    if(cursor<text.data.length)fragment.appendChild(ownerDocument.createTextNode(text.data.slice(cursor)))
    text.replaceWith(fragment)
  }
}

function collapseReferences(root,ownerDocument){
  for(const marker of root.querySelectorAll('['+MARKER_ATTR+']')){
    const id=marker.getAttribute(MARKER_ATTR)
    marker.replaceWith(ownerDocument.createTextNode(id?'{{'+id+'}}':''))
  }
}

function replacementNode(replacement,inline,ownerDocument){
  if(replacement.kind==='text'){
    const fragment=ownerDocument.createDocumentFragment()
    fragment.appendChild(ownerDocument.createTextNode(replacement.text))
    protectInlineLiteralTokens(fragment,Object.keys(inline),ownerDocument)
    return fragment
  }
  if(replacement.kind==='inline-reference'){
    if(!Object.hasOwn(inline,replacement.id))throw new Error('Unknown inline reference: '+replacement.id)
    const marker=ownerDocument.createElement('span')
    marker.setAttribute('data-inline-plugin','__reference__')
    marker.setAttribute(MARKER_ATTR,replacement.id)
    marker.contentEditable='false'
    return marker
  }
  if(replacement.kind==='html'){
    const template=ownerDocument.createElement('template')
    template.innerHTML=/** @type {any} */(toTrustedHtml(normalizeRichText(replacement.html,ownerDocument),ownerDocument))
    protectInlineLiteralTokens(template.content,Object.keys(inline),ownerDocument)
    return template.content
  }
  throw new TypeError('Unknown rich-text replacement kind')
}

/**
 * Count logical UTF-16 positions in canonical rich text. Inline references are
 * atomic and count as one position, matching selection/history offsets.
 *
 * @param {string} html
 * @param {Record<string, unknown> | undefined} inline
 * @param {Document} ownerDocument
 */
export function getRichTextLogicalLength(html,inline,ownerDocument){
  const ownedInline=ownInline(inline)
  const template=ownerDocument.createElement('template')
  template.innerHTML=/** @type {any} */(toTrustedHtml(normalizeRichText(String(html??''),ownerDocument),ownerDocument))
  expandReferences(template.content,ownedInline,ownerDocument)
  return getTextLength(template.content)
}

/** Ensure text after one inline occurrence and return its logical caret.
 * @param {string} html
 * @param {Record<string, unknown>} inline
 * @param {string} id
 * @param {string} suffix
 * @param {Document} ownerDocument
 * @returns {{html:string,offset:number}|null}
 */
export function ensureRichTextReferenceSuffix(html,inline,id,suffix,ownerDocument){
  const template=ownerDocument.createElement('template')
  template.innerHTML=/** @type {any} */(toTrustedHtml(normalizeRichText(html,ownerDocument),ownerDocument))
  expandReferences(template.content,inline,ownerDocument)
  const marker=Array.from(template.content.querySelectorAll('['+MARKER_ATTR+']')).find(node=>node.getAttribute(MARKER_ATTR)===id)
  if(!marker)return null
  const offset=getTextOffset(template.content,marker,1)
  const next=findNodeAtOffset(template.content,offset,'start')
  const text=next.node.nodeType===3?(next.node.textContent??'').slice(next.offset):''
  if(!text.startsWith(suffix)&&!(suffix==='\u00a0'&&/^\s/.test(text))){
    marker.after(ownerDocument.createTextNode(suffix))
  }
  collapseReferences(template.content,ownerDocument)
  return {html:normalizeRichText(template.innerHTML,ownerDocument),offset:offset+suffix.length}
}

/**
 * Replace a logical range in canonical rich text.
 * Matching inline placeholders count as one logical unit; unmatched placeholder-
 * shaped author text remains ordinary text.
 *
 * @param {string} html
 * @param {Record<string, unknown> | undefined} inline
 * @param {{start:number,end:number}} range
 * @param {{kind:'text',text:string}|{kind:'html',html:string}|{kind:'inline-reference',id:string}} replacement
 * @param {Document} ownerDocument
 */
export function replaceRichTextRange(html,inline,range,replacement,ownerDocument){
  if(!ownerDocument?.createElement)throw new TypeError('RichTextOperations requires an ownerDocument')
  const start=Math.max(0,Math.trunc(range?.start)||0)
  const end=Math.max(start,Math.trunc(range?.end)||0)
  const ownedInline=ownInline(inline)
  const template=ownerDocument.createElement('template')
  template.innerHTML=/** @type {any} */(toTrustedHtml(normalizeRichText(String(html??''),ownerDocument),ownerDocument))
  expandReferences(template.content,ownedInline,ownerDocument)

  const from=findNodeAtOffset(template.content,start,'start')
  const to=findNodeAtOffset(template.content,end,'end')
  const selection=ownerDocument.createRange()
  selection.setStart(from.node,from.offset)
  selection.setEnd(to.node,to.offset)
  selection.deleteContents()
  selection.insertNode(replacementNode(replacement,ownedInline,ownerDocument))

  collapseReferences(template.content,ownerDocument)
  return normalizeRichText(template.innerHTML,ownerDocument)
}

/**
 * Split one canonical rich-text field at a logical selection. Matching inline
 * references remain atomic. A non-collapsed range is removed before the split,
 * matching native Enter behavior after replacing the current selection.
 *
 * @param {string} html
 * @param {Record<string, unknown> | undefined} inline
 * @param {{start:number,end?:number}} range
 * @param {Document} ownerDocument
 * @returns {{ before: string, after: string }}
 */
/**
 * Slice one canonical rich-text field into before/selected/after fragments.
 * Inline references stay atomic and author-authored placeholder literals remain text.
 *
 * @param {string} html
 * @param {Record<string, unknown> | undefined} inline
 * @param {{start:number,end:number}} range
 * @param {Document} ownerDocument
 * @returns {{before:string,selected:string,after:string}}
 */
export function sliceRichTextRange(html, inline, range, ownerDocument) {
  const start=Math.max(0,Math.trunc(range?.start)||0)
  const end=Math.max(start,Math.trunc(range?.end)||0)
  const before=replaceRichTextRange(
    html,inline,{start,end:Number.MAX_SAFE_INTEGER},{kind:'text',text:''},ownerDocument,
  )
  const after=replaceRichTextRange(
    html,inline,{start:0,end},{kind:'text',text:''},ownerDocument,
  )
  let selected=replaceRichTextRange(
    html,inline,{start:end,end:Number.MAX_SAFE_INTEGER},{kind:'text',text:''},ownerDocument,
  )
  selected=replaceRichTextRange(
    selected,inline,{start:0,end:start},{kind:'text',text:''},ownerDocument,
  )
  return {before,selected,after}
}

export function splitRichTextRange(html, inline, range, ownerDocument) {
  const start = Math.max(0, Math.trunc(range?.start) || 0)
  const end = Math.max(start, Math.trunc(range?.end ?? start) || 0)
  const collapsed = replaceRichTextRange(
    html,
    inline,
    { start, end },
    { kind: 'text', text: '' },
    ownerDocument,
  )
  return {
    before: replaceRichTextRange(
      collapsed,
      inline,
      { start, end: Number.MAX_SAFE_INTEGER },
      { kind: 'text', text: '' },
      ownerDocument,
    ),
    after: replaceRichTextRange(
      collapsed,
      inline,
      { start: 0, end: start },
      { kind: 'text', text: '' },
      ownerDocument,
    ),
  }
}

/**
 * Scan placeholder-shaped tokens in canonical rich text without trusting raw
 * HTML attributes. References are tokens with an own matching inline entry;
 * all other tokens remain literal author text.
 *
 * @param {string} html
 * @param {Record<string, unknown> | undefined} inline
 * @param {Document} ownerDocument
 * @returns {{ references: Set<string>, literals: Set<string>, occurrences: Map<string, number> }}
 */
export function scanRichTextPlaceholders(html, inline, ownerDocument) {
  if (!ownerDocument?.createElement) throw new TypeError('RichTextOperations requires an ownerDocument')
  const ownedInline = ownInline(inline)
  const template = ownerDocument.createElement('template')
  template.innerHTML = /** @type {any} */ (toTrustedHtml(
    normalizeRichText(String(html ?? ''), ownerDocument),
    ownerDocument,
  ))
  const references = new Set()
  const literals = new Set()
  const occurrences = new Map()
  const walker = ownerDocument.createTreeWalker(template.content, 4)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = /** @type {Text} */ (node)
    for (const match of richTextPlaceholderMatches(text.data)) {
      const id = match[1]
      if (isLiteralInlineText(text)) {
        literals.add(id)
        continue
      }
      if (Object.hasOwn(ownedInline, id)) {
        references.add(id)
        occurrences.set(id, (occurrences.get(id) ?? 0) + 1)
      }
      else literals.add(id)
    }
  }
  return { references, literals, occurrences }
}

/**
 * Replace one owned inline reference token in text nodes only.
 * Raw HTML attributes and unmatched author-authored placeholder literals are untouched.
 *
 * @param {string} html
 * @param {Record<string, unknown> | undefined} inline
 * @param {string} id
 * @param {string} replacement
 * @param {Document} ownerDocument
 */
export function replaceRichTextReference(html,inline,id,replacement,ownerDocument){
  const ownedInline=ownInline(inline)
  if(!Object.hasOwn(ownedInline,id))return normalizeRichText(String(html??''),ownerDocument)
  const template=ownerDocument.createElement('template')
  template.innerHTML=/** @type {any} */(toTrustedHtml(
    normalizeRichText(String(html??''),ownerDocument),
    ownerDocument,
  ))
  const walker=ownerDocument.createTreeWalker(template.content,4)
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    const text=/** @type {Text} */(node)
    if(isLiteralInlineText(text)||!text.data.includes('{{'))continue
    text.data=text.data.replace(PLACEHOLDER_RE,(token,tokenId)=>tokenId===id?replacement:token)
  }
  return normalizeRichText(template.innerHTML,ownerDocument)
}

/**
 * Remap canonical inline references in text nodes only. Placeholder-shaped
 * author text and HTML attributes are never rewritten.
 *
 * @param {string} html
 * @param {Record<string, unknown> | undefined} inline
 * @param {Map<string, string>} remap
 * @param {Document} ownerDocument
 * @returns {string}
 */
export function remapRichTextReferences(html, inline, remap, ownerDocument) {
  if (!remap?.size) return normalizeRichText(String(html ?? ''), ownerDocument)
  const ownedInline = ownInline(inline)
  const template = ownerDocument.createElement('template')
  template.innerHTML = /** @type {any} */ (toTrustedHtml(
    normalizeRichText(String(html ?? ''), ownerDocument),
    ownerDocument,
  ))
  const walker = ownerDocument.createTreeWalker(template.content, 4)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = /** @type {Text} */ (node)
    if (isLiteralInlineText(text)||!text.data.includes('{{')) continue
    text.data = text.data.replace(PLACEHOLDER_RE, (token, id) => {
      if (!Object.hasOwn(ownedInline, id)) return token
      const next = remap.get(id)
      return next ? `{{${next}}}` : token
    })
  }
  return normalizeRichText(template.innerHTML, ownerDocument)
}
