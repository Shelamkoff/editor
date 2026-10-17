// @ts-check
import { ALLOWED_TAGS } from '../shared/sanitize/allowlist.js'
import { sanitizeHtml } from '../shared/sanitize/sanitizeHtml.js'
import { sanitizeRawHtml } from '../shared/sanitize/sanitizeRawHtml.js'
import { toTrustedHtml } from '../shared/sanitize/trustedHtml.js'
import { synchronousResult } from '../shared/synchronousResult.js'

// Unclaimed top-level text containers still delimit authored HTML blocks.
// Registered import capabilities take precedence over this fallback.
const TEXT_BLOCK_ROOTS=new Set([
  'p','div','li','h1','h2','h3','h4','h5','h6',
  'blockquote','pre','tr','td','th','figure',
])

function orderedTypes(registry,currentType){
  const types=registry.blockTypes
  return currentType&&types.includes(currentType)
    ?[currentType,...types.filter(type=>type!==currentType)]
    :[...types]
}

function meaningfulHtml(html,ownerDocument){
  if(!html)return false
  const probe=ownerDocument.createElement('div')
  probe.innerHTML=/** @type {any} */(toTrustedHtml(html,ownerDocument))
  // Formatting shells and unlabeled anchors have no author content. Do not
  // replace a selected range with empty marks. <br> is the only allowed
  // inline void element that represents real content without text; media
  // roots are handled separately by registered structural import capabilities.
  return !!probe.textContent?.trim()||!!probe.querySelector('br')
}

function serializeNodes(nodes,ownerDocument){
  const container=ownerDocument.createElement('div')
  for(const node of nodes)container.appendChild(node.cloneNode(true))
  return sanitizeHtml(container.innerHTML,ownerDocument)
}

function serializeRichText(element,ownerDocument){
  return sanitizeHtml(element.innerHTML,ownerDocument)
}

function materializeRichText(html,{registry,types,context}){
  const payload={kind:'rich-text',data:{text:html}}
  for(const type of types){
    const definition=registry.getBlockDefinition(type)
    const conversion=definition?.capabilities?.conversion
    if(!conversion)continue
    const accepted=synchronousResult(conversion.canImport(payload))
    if(typeof accepted!=='boolean')throw new TypeError(`HTML conversion canImport() for "${type}" must return a boolean`)
    if(!accepted)continue
    return {type,data:synchronousResult(conversion.import(payload))}
  }
  throw new Error('No registered block type can import rich-text HTML')
}

/**
 * Prepare safe external HTML without mutating editor state.
 *
 * @param {string} html
 * @param {{
 *   ownerDocument:Document,
 *   registry:any,
 *   currentType?:string|null,
 *   createId:(prefix:string)=>string,
 * }} options
 * @returns {{kind:'inline',html:string}|{kind:'blocks',blocks:Array<{type:string,data:unknown}>,leadingInlineHtml?:string}|null}
 */
export function prepareHtmlImport(html,options){
  const ownerDocument=options?.ownerDocument
  const registry=options?.registry
  if(!ownerDocument||!registry)throw new TypeError('HTML import requires ownerDocument and registry')

  const safe=sanitizeRawHtml(String(html??''),ownerDocument)
  if(!safe)return null
  const template=ownerDocument.createElement('template')
  template.innerHTML=/** @type {any} */(toTrustedHtml(safe,ownerDocument))

  const types=orderedTypes(registry,options.currentType??null)
  const context=Object.freeze({
    ownerDocument,
    createId:prefix=>options.createId(prefix),
    serializeRichText:element=>serializeRichText(element,ownerDocument),
  })
  const parts=[]
  let segment=[]
  let structural=false

  const flush=()=>{
    if(!segment.length)return
    const value=serializeNodes(segment,ownerDocument)
    segment=[]
    if(!meaningfulHtml(value,ownerDocument))return
    parts.push({kind:'rich-text',html:value})
  }

  const matching=(element)=>{
    for(const type of types){
      const definition=registry.getBlockDefinition(type)
      const capability=definition?.capabilities?.htmlImport
      if(!capability)continue
      const accepted=synchronousResult(capability.matchesRoot(element))
      if(typeof accepted!=='boolean')throw new TypeError(`HTML import matchesRoot() for "${type}" must return a boolean`)
      if(accepted)return {type,capability}
    }
    return null
  }

  const visit=(node,topLevel=false)=>{
    if(node.nodeType===3){
      segment.push(node)
      return
    }
    if(node.nodeType!==1)return
    const element=/** @type {Element} */(node)
    const match=matching(element)
    if(match){
      flush()
      structural=true
      const data=synchronousResult(match.capability.importRoot(element,context))
      parts.push({kind:'block',type:match.type,data,
        inlineWhenSingleRoot:match.capability.inlineWhenSingleRoot===true,
        sourceRoot:element})
      return
    }

    const tag=element.tagName.toLowerCase()
    if(ALLOWED_TAGS.has(tag)){
      segment.push(element)
      return
    }

    // Safe but unsupported structural wrappers are transparent. Their children
    // remain in source order and may resolve to other registered root capabilities.
    const boundary=topLevel&&TEXT_BLOCK_ROOTS.has(tag)
    if(boundary)flush()
    const firstPart=parts.length
    if(topLevel||element.children.length||element.textContent?.trim())structural=true
    for(const child of [...element.childNodes])visit(child,false)
    if(boundary){
      flush()
      // Paragraph/div roots are text-like at the caret. Other unclaimed
      // block roots retain structural placement rather than erasing a
      // locally selected text range. A matched descendant keeps its contract.
      if(parts[firstPart]?.kind==='rich-text'){
        parts[firstPart].inlineWhenLeading=tag==='p'||tag==='div'
      }
    }
  }

  for(const child of [...template.content.childNodes])visit(child,true)
  flush()
  if(!parts.length)return null

  // A matched root owns its imported data. An opt-in importer can treat the
  // sole accepted root as inline text even if the root was nested in transparent
  // wrappers; never serialize the wrapper in place of its actual matched root.
  if(parts.length===1&&parts[0].kind==='block'&&parts[0].inlineWhenSingleRoot){
    const html=serializeRichText(parts[0].sourceRoot,ownerDocument)
    if(meaningfulHtml(html,ownerDocument))return {kind:'inline',html}
  }

  // A transparent div with only inline children retains v1's local Paste
  // behavior, while multiple authored roots remain structural.
  const roots=[...template.content.childNodes].filter(node=>node.nodeType===1
    ||(node.nodeType===3&&node.textContent?.trim()))
  if(roots.length===1&&roots[0].nodeType===1&&parts.length===1){
    const root=/** @type {Element} */(roots[0])
    if(root.tagName==='DIV'&&parts[0].kind==='rich-text'){
      return {kind:'inline',html:parts[0].html}
    }
  }

  if(!structural&&parts.length===1&&parts[0].kind==='rich-text'){
    return {kind:'inline',html:parts[0].html}
  }

  // A leading inline-capable root is inserted at the current caret, even
  // when other HTML roots create subsequent canonical blocks.
  const first=parts[0]
  const leadingInlineHtml=first?.kind==='rich-text'&&first.inlineWhenLeading!==false?first.html
    :first?.kind==='block'&&first.inlineWhenSingleRoot
      ?serializeRichText(first.sourceRoot,ownerDocument):null
  // Fallback roots become the configured default block, not whichever
  // type currently owns the caret. Explicit HTML importers retain their type.
  const fallbackTypes=orderedTypes(registry,registry.defaultBlockType??null)
  const blocks=parts.map(part=>part.kind==='block'
    ?{type:part.type,data:part.data}
    :materializeRichText(part.html,{registry,types:fallbackTypes,context}))
  return {kind:'blocks',blocks,...(leadingInlineHtml===null?{}:{leadingInlineHtml})}
}
