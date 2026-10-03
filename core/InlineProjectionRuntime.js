// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { getTextOffset } from '../shared/textOffset.js'
import { normalizeRichText } from '../shared/richTextCodec.js'
import { toTrustedHtml } from '../shared/sanitize/trustedHtml.js'

const PLACEHOLDER_RE=/\{\{([A-Za-z0-9_-]+)\}\}/g

function object(value){
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{}
}

function collectTokens(html,counts){
  for(const match of String(html??'').matchAll(PLACEHOLDER_RE)){
    counts.set(match[1],(counts.get(match[1])??0)+1)
  }
}

function richFieldMap(definition,data){
  const fields=new Map()
  if(typeof definition?.schema?.mapRichText!=='function')return fields
  const owned=cloneEditorData(data)
  definition.schema.mapRichText(owned,(html,key)=>{
    fields.set(key,String(html??''))
    return html
  })
  return fields
}

export class InlineProjectionRuntime {
  #registry
  #ownerDocument
  #blocks=new Map()
  #owned=new WeakMap()
  #readOnly
  #destroyed=false

  constructor({registry,ownerDocument,readOnly=false}){
    if(!registry)throw new TypeError('InlineProjectionRuntime requires an ExtensionRegistry')
    if(!ownerDocument?.createElement)throw new TypeError('InlineProjectionRuntime requires an ownerDocument')
    this.#registry=registry
    this.#ownerDocument=ownerDocument
    this.#readOnly=readOnly===true
  }

  reconcileBlock(blockId,record,definition,fields,baseContext,{preserveSourceProjection=false}={}){
    this.#assertLive()
    let state=this.#blocks.get(blockId)
    if(!state){
      state={widgets:new Map()}
      this.#blocks.set(blockId,state)
    }
    this.#projectState(
      blockId,state,record,definition,fields,baseContext,{preserveSourceProjection},
    )
  }

  prepareBlock(blockId,record,definition,fields,baseContext){
    this.#assertLive()
    const previous=this.#blocks.get(blockId)
    const state={widgets:new Map()}
    try{
      this.#projectState(
        blockId,state,record,definition,fields,baseContext,{preserveSourceProjection:false},
      )
    }catch(error){
      this.#destroyState(state)
      throw error
    }

    let applied=false
    let finished=false
    const destroyCandidate=()=>this.#destroyState(state)

    return Object.freeze({
      apply:()=>{
        if(finished||applied)throw new Error('Prepared inline projection cannot be applied twice')
        this.#blocks.set(blockId,state)
        applied=true
      },
      recover:()=>{
        if(finished)return
        if(applied){
          if(previous)this.#blocks.set(blockId,previous)
          else this.#blocks.delete(blockId)
        }
        destroyCandidate()
        finished=true
      },
      finalize:()=>{
        if(finished)return
        if(!applied)throw new Error('Cannot finalize an unapplied inline projection')
        if(previous&&previous!==state)this.#destroyState(previous)
        finished=true
      },
      discard:()=>{
        if(finished)return
        if(applied)throw new Error('Applied inline projection must recover or finalize')
        destroyCandidate()
        finished=true
      },
    })
  }

  serializeBlock(blockId,record,definition,fields,readData){
    this.#assertLive()
    const state=this.#blocks.get(blockId)
    const actual=new Map((fields??[]).filter(field=>field?.mode==='rich-text'&&field.element).map(field=>[field.key,field.element]))
    const serialized=new Map()
    const counts=new Map()

    for(const [key,element] of actual){
      const html=this.#serializeField(blockId,element)
      serialized.set(key,html)
      collectTokens(html,counts)
    }

    let data=cloneEditorData(readData)
    if(typeof definition?.schema?.mapRichText==='function'){
      data=definition.schema.mapRichText(data,(html,key)=>serialized.get(key)??html)
    }

    const sourceInline=object(record.inline)
    const nextInline={}
    for(const [id,count] of counts){
      if(count!==1){
        if(Object.hasOwn(sourceInline,id))throw new Error('Inline widget reference must be unique: '+id)
        continue
      }
      const ref=sourceInline[id]
      if(!ref||typeof ref!=='object'||Array.isArray(ref))continue
      nextInline[id]=cloneEditorData(ref)
    }

    // Owned widgets are authoritative only for identity/presence; their data
    // always comes from the canonical inline map updated through widget context.
    if(state){
      for(const [id,entry] of state.widgets){
        if(counts.get(id)!==1)continue
        const ref=sourceInline[id]
        if(ref)nextInline[id]=cloneEditorData(ref)
        if(!entry.element.isConnected&&entry.element.parentNode===null){
          // A browser/user deletion prunes the widget on the next commit.
          delete nextInline[id]
        }
      }
    }

    return {
      data,
      inline:Object.keys(nextInline).length?nextInline:undefined,
    }
  }

  resolveWidgetInputTarget(selection,inputType){
    this.#assertLive()
    if(!selection?.isCollapsed||!selection.anchorNode)return null

    const ownedEntry=node=>{
      for(let current=node;current;current=current.parentNode){
        const meta=this.#owned.get(current)
        if(meta){
          const entry=this.#blocks.get(meta.blockId)?.widgets.get(meta.id)
          return entry?{meta,entry}:null
        }
      }
      return null
    }

    let resolved=ownedEntry(selection.anchorNode)
    let position='inside'
    let offset=0

    if(resolved){
      try{offset=getTextOffset(resolved.entry.element,selection.anchorNode,selection.anchorOffset)}
      catch{offset=resolved.entry.element.textContent?.length??0}
    }else{
      let candidate=null
      if(inputType==='deleteContentBackward'){
        if(selection.anchorNode.nodeType===3&&selection.anchorOffset===0){
          candidate=selection.anchorNode.previousSibling
        }else if(selection.anchorNode.nodeType===1&&selection.anchorOffset>0){
          candidate=selection.anchorNode.childNodes[selection.anchorOffset-1]??null
        }
        position='after'
      }else if(inputType==='deleteContentForward'){
        if(selection.anchorNode.nodeType===3&&selection.anchorOffset===(selection.anchorNode.textContent?.length??0)){
          candidate=selection.anchorNode.nextSibling
        }else if(selection.anchorNode.nodeType===1){
          candidate=selection.anchorNode.childNodes[selection.anchorOffset]??null
        }
        position='before'
      }
      if(candidate)resolved=ownedEntry(candidate)
      if(resolved)offset=position==='after'
        ?(resolved.entry.element.textContent?.length??0)
        :0
    }

    if(!resolved)return null
    const {meta,entry}=resolved
    const field=entry.element.closest('[contenteditable="true"]')
    if(!field)return null
    let logicalOffset=0
    try{logicalOffset=getTextOffset(field,entry.element,0)}catch{}
    return {
      blockId:meta.blockId,
      inlineId:meta.id,
      type:entry.type,
      fieldKey:entry.fieldKey,
      element:entry.element,
      data:cloneEditorData(entry.data),
      position,
      offset,
      logicalOffset,
    }
  }

  setReadOnly(value){
    this.#assertLive()
    this.#readOnly=value===true
    for(const state of this.#blocks.values()){
      for(const entry of state.widgets.values())entry.instance.setReadOnly(this.#readOnly)
    }
  }

  destroyBlock(blockId){
    const state=this.#blocks.get(blockId)
    if(!state)return
    this.#destroyState(state)
    this.#blocks.delete(blockId)
  }

  destroy(){
    if(this.#destroyed)return
    this.#destroyed=true
    for(const blockId of [...this.#blocks.keys()])this.destroyBlock(blockId)
  }

  #projectState(blockId,state,record,definition,fields,baseContext,{preserveSourceProjection=false}={}){
    const richFields=new Map((fields??[]).filter(field=>field?.mode==='rich-text'&&field.element).map(field=>[field.key,field.element]))
    const canonical=richFieldMap(definition,record.data)
    const inline=object(record.inline)
    const counts=new Map()
    for(const html of canonical.values())collectTokens(html,counts)
    const live=new Set()

    for(const [fieldKey,element] of richFields){
      const html=canonical.get(fieldKey)
      if(html===undefined)continue

      if(!preserveSourceProjection){
        const template=this.#ownerDocument.createElement('template')
        template.innerHTML=/** @type {any} */(toTrustedHtml(normalizeRichText(html,this.#ownerDocument),this.#ownerDocument))
        element.replaceChildren(...template.content.childNodes)
      }

      this.#hydrateField(blockId,fieldKey,element,inline,counts,state,baseContext,live)
    }

    for(const [id,entry] of state.widgets){
      if(live.has(id))continue
      this.#destroyWidget(entry)
      state.widgets.delete(id)
    }
  }

  #hydrateField(blockId,fieldKey,element,inline,counts,state,baseContext,live){
    const textNodes=[]
    const walker=this.#ownerDocument.createTreeWalker(element,4)
    let current=walker.nextNode()
    while(current){textNodes.push(/** @type {Text} */(current));current=walker.nextNode()}

    for(const text of textNodes){
      if(!text.data.includes('{{'))continue
      const fragment=this.#ownerDocument.createDocumentFragment()
      let cursor=0
      let changed=false

      for(const match of text.data.matchAll(PLACEHOLDER_RE)){
        const id=match[1]
        const ref=Object.hasOwn(inline,id)?inline[id]:undefined
        if(!ref||typeof ref!=='object'||Array.isArray(ref)||counts.get(id)!==1)continue
        const type=typeof ref.type==='string'?ref.type:''
        const definition=this.#registry.getInlineDefinition(type)
        const runtime=this.#registry.getInlineRuntime(type)
        if(!definition||!runtime)continue

        let decoded
        try{
          decoded=definition.schema.decode({dataVersion:ref.dataVersion,data:ref.data})
        }catch{
          continue
        }

        if(match.index>cursor)fragment.appendChild(this.#ownerDocument.createTextNode(text.data.slice(cursor,match.index)))

        let entry=state.widgets.get(id)
        if(entry&&entry.type!==type){
          this.#destroyWidget(entry)
          state.widgets.delete(id)
          entry=null
        }

        if(!entry){
          const Ctor=this.#ownerDocument.defaultView?.AbortController??AbortController
          const controller=new Ctor()
          const makeContext=baseContext?.createInlineWidgetContext
          if(typeof makeContext!=='function')throw new Error('Block context does not provide inline widget mutations')
          const context=makeContext(fieldKey,id,type,controller.signal)
          const instance=runtime.create(id,decoded.data,context)
          if(!instance?.element||typeof instance.setReadOnly!=='function'||typeof instance.destroy!=='function'){
            controller.abort()
            try{instance?.destroy?.()}catch{}
            throw new TypeError('Inline runtime "'+type+'" returned an invalid widget instance')
          }
          entry={id,type,fieldKey,instance,element:instance.element,controller,data:decoded.data}
          state.widgets.set(id,entry)
          this.#owned.set(entry.element,{blockId,id})
          instance.setReadOnly(this.#readOnly)
        }else{
          entry.fieldKey=fieldKey
          if(typeof entry.instance.update==='function'&&JSON.stringify(entry.data)!==JSON.stringify(decoded.data)){
            entry.instance.update(decoded.data,entry.data)
          }
          entry.data=decoded.data
          entry.instance.setReadOnly(this.#readOnly)
        }

        fragment.appendChild(entry.element)
        live.add(id)
        cursor=match.index+match[0].length
        changed=true
      }

      if(!changed)continue
      if(cursor<text.data.length)fragment.appendChild(this.#ownerDocument.createTextNode(text.data.slice(cursor)))
      text.replaceWith(fragment)
    }

    // Source native-input projection already contains owned widget elements.
    for(const entry of state.widgets.values()){
      if(entry.fieldKey!==fieldKey)continue
      if(element.contains(entry.element))live.add(entry.id)
    }
  }

  #serializeField(blockId,field){
    const container=this.#ownerDocument.createElement('div')
    const append=(source,target)=>{
      for(const node of source.childNodes){
        const owned=this.#owned.get(node)
        if(owned?.blockId===blockId){
          target.appendChild(this.#ownerDocument.createTextNode('{{'+owned.id+'}}'))
          continue
        }
        if(node.nodeType===3){
          target.appendChild(this.#ownerDocument.createTextNode(node.textContent??''))
          continue
        }
        if(node.nodeType!==1)continue
        const clone=/** @type {Element} */(node).cloneNode(false)
        append(node,clone)
        target.appendChild(clone)
      }
    }
    append(field,container)
    return normalizeRichText(container.innerHTML,this.#ownerDocument)
  }

  #destroyState(state){
    if(!state)return
    for(const entry of state.widgets.values())this.#destroyWidget(entry)
    state.widgets.clear()
  }

  #destroyWidget(entry){
    try{entry.controller?.abort()}catch{}
    try{entry.instance?.destroy?.()}catch{}
    try{entry.element?.remove?.()}catch{}
  }

  #assertLive(){
    if(this.#destroyed)throw new Error('InlineProjectionRuntime is destroyed')
  }
}
