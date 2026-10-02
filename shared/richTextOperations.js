// @ts-check
import { findNodeAtOffset } from './textOffset.js'
import { normalizeRichText } from './richTextCodec.js'
import { toTrustedHtml } from './sanitize/trustedHtml.js'

const PLACEHOLDER_RE=/\{\{([A-Za-z0-9_-]+)\}\}/g
const MARKER_ATTR='data-oe-inline-reference'

function ownInline(inline){
  return inline&&typeof inline==='object'&&!Array.isArray(inline)?inline:{}
}

function expandReferences(root,inline,ownerDocument){
  const textNodes=[]
  const walker=ownerDocument.createTreeWalker(root,4)
  let node=walker.nextNode()
  while(node){textNodes.push(/** @type {Text} */(node));node=walker.nextNode()}
  for(const text of textNodes){
    if(!text.data.includes('{{'))continue
    const fragment=ownerDocument.createDocumentFragment()
    let cursor=0
    let changed=false
    for(const match of text.data.matchAll(PLACEHOLDER_RE)){
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
  if(replacement.kind==='text')return ownerDocument.createTextNode(replacement.text)
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
    return template.content
  }
  throw new TypeError('Unknown rich-text replacement kind')
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
