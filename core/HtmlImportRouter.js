// @ts-check
import { ALLOWED_TAGS } from '../shared/sanitize/allowlist.js'
import { sanitizeHtml } from '../shared/sanitize/sanitizeHtml.js'
import { sanitizeRawHtml } from '../shared/sanitize/sanitizeRawHtml.js'
import { toTrustedHtml } from '../shared/sanitize/trustedHtml.js'

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
  return !!probe.textContent?.trim()||!!probe.querySelector('*')
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
    if(!conversion.canImport(payload))continue
    return {type,data:conversion.import(payload)}
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
 * @returns {{kind:'inline',html:string}|{kind:'blocks',blocks:Array<{type:string,data:unknown}>}|null}
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
      if(capability.matchesRoot(element))return {type,capability}
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
      const data=match.capability.importRoot(element,context)
      parts.push({kind:'block',type:match.type,data})
      return
    }

    const tag=element.tagName.toLowerCase()
    if(ALLOWED_TAGS.has(tag)){
      segment.push(element)
      return
    }

    // Safe but unsupported structural wrappers are transparent. Their children
    // remain in source order and may resolve to other registered root capabilities.
    if(topLevel||element.children.length||element.textContent?.trim())structural=true
    for(const child of [...element.childNodes])visit(child,false)
  }

  for(const child of [...template.content.childNodes])visit(child,true)
  flush()
  if(!parts.length)return null

  if(!structural&&parts.length===1&&parts[0].kind==='rich-text'){
    return {kind:'inline',html:parts[0].html}
  }

  const blocks=parts.map(part=>part.kind==='block'
    ?{type:part.type,data:part.data}
    :materializeRichText(part.html,{registry,types,context}))
  return {kind:'blocks',blocks}
}
