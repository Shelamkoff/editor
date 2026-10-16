// @ts-check
import { ReadOnlyRecoveryError } from './ReadOnlyRecoveryError.js'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { getTextOffset } from '../shared/textOffset.js'
import { InstanceScope } from './InstanceScope.js'
import { captureInstanceMethod, captureInstanceDestroy } from './instanceMethods.js'
import { normalizeRichText } from '../shared/richTextCodec.js'
import { toTrustedHtml } from '../shared/sanitize/trustedHtml.js'
import { isRichTextCaretPadding, projectRichTextCaretPadding } from '../shared/richTextCaretPadding.js'
import { scanRichTextPlaceholders, richTextPlaceholderMatches } from '../shared/richTextOperations.js'
import { richTextFieldMap, mapRichTextFields, mountedRichFields } from './projectionFields.js'
import { synchronousResult } from '../shared/synchronousResult.js'

const liveWidgetRoots=new WeakMap()

function object(value){
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{}
}

function snapshotInlineInstance(source,type,destroySource,requiresUpdate=false){
  synchronousResult(source)
  if(!source||typeof source!=='object'||Array.isArray(source)){
    throw new TypeError('Inline runtime "'+type+'" returned an invalid widget instance')
  }
  const element=source.element
  const update=captureInstanceMethod(source,'update')
  const setReadOnly=captureInstanceMethod(source,'setReadOnly')
  const focus=captureInstanceMethod(source,'focus')
  const afterNativeEdit=captureInstanceMethod(source,'afterNativeEdit')
  if(!element||!setReadOnly||!destroySource||(requiresUpdate&&!update)){
    throw new TypeError('Inline runtime "'+type+'" returned an invalid widget instance')
  }
  const instance={
    element,
    setReadOnly,
    destroy:destroySource,
  }
  if(update)instance.update=update
  if(focus)instance.focus=focus
  if(afterNativeEdit)instance.afterNativeEdit=afterNativeEdit
  return Object.freeze(instance)
}

export class InlineProjectionRuntime {
  #registry
  #ownerDocument
  #blocks=new Map()
  #projectingBlocks=new Set()
  #invalidatedProjectionBlocks=new Set()
  /** @type {Set<() => void>} */
  #pendingPreparations=new Set()
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
    if(this.#projectingBlocks.has(blockId)){
      throw new Error('Cannot reenter inline projection for the same block')
    }
    this.#projectingBlocks.add(blockId)
    try{
      let state=this.#blocks.get(blockId)
      if(!state){
        state={widgets:new Map(),staged:false}
        this.#blocks.set(blockId,state)
      }
      try{
        this.#projectState(
          blockId,state,record,definition,fields,baseContext,{preserveSourceProjection},
        )
        if(this.#destroyed||this.#blocks.get(blockId)!==state){
          throw new Error('Inline projection owner was revoked during reconciliation')
        }
      }catch(error){
        // A callback may mutate an instance or retire this block. Never keep
        // partly written widget DOM/cache as authoritative canonical state.
        if(this.#blocks.get(blockId)===state)this.#blocks.delete(blockId)
        this.#destroyState(state)
        throw error
      }
    }finally{
      this.#projectingBlocks.delete(blockId)
      this.#invalidatedProjectionBlocks.delete(blockId)
    }
  }

  prepareBlock(blockId,record,definition,fields,baseContext,generation){
    this.#assertLive()
    if(this.#projectingBlocks.has(blockId)){
      throw new Error('Cannot reenter inline projection for the same block')
    }
    this.#projectingBlocks.add(blockId)
    const previous=this.#blocks.get(blockId)
    const state={widgets:new Map(),staged:true,generation}
    try{
      this.#projectState(
        blockId,state,record,definition,fields,baseContext,{preserveSourceProjection:false},
      )
      if(this.#destroyed||this.#blocks.get(blockId)!==previous
        ||this.#invalidatedProjectionBlocks.has(blockId)){
        throw new Error('Inline projection owner was revoked during preparation')
      }
    }catch(error){
      this.#destroyState(state)
      throw error
    }finally{
      this.#projectingBlocks.delete(blockId)
      this.#invalidatedProjectionBlocks.delete(blockId)
    }

    let applied=false
    let finished=false
    const destroyCandidate=()=>this.#destroyState(state)
    // A detached prepared state is still owned by this runtime. Track both
    // its provisional resources and the retired predecessor until settlement.
    const retire=()=>{
      if(finished)return
      finished=true
      this.#pendingPreparations.delete(retire)
      destroyCandidate()
      if(previous&&previous!==state)this.#destroyState(previous)
    }
    retire.blockId=blockId
    this.#pendingPreparations.add(retire)

    return Object.freeze({
      apply:()=>{
        this.#assertLive()
        if(finished||applied)throw new Error('Prepared inline projection cannot be applied twice')
        if(this.#blocks.get(blockId)!==previous){
          finished=true
          this.#pendingPreparations.delete(retire)
          destroyCandidate()
          throw new Error('Prepared inline projection owner is stale')
        }
        this.#blocks.set(blockId,state)
        applied=true
      },
      recover:()=>{
        if(finished)return
        finished=true
        this.#pendingPreparations.delete(retire)
        const current=this.#blocks.get(blockId)
        if(applied&&!this.#destroyed&&current!==state){
          // A newer preparation owns this state as its recoverable
          // predecessor. Do not destroy a widget that it may restore.
          if(previous&&current!==previous)this.#destroyState(previous)
          return
        }
        if(applied&&!this.#destroyed&&current===state){
          if(previous)this.#blocks.set(blockId,previous)
          else this.#blocks.delete(blockId)
        }
        destroyCandidate()
        if(applied&&!this.#destroyed&&previous
          &&this.#blocks.get(blockId)!==previous)this.#destroyState(previous)
      },
      finalize:()=>{
        this.#assertLive()
        if(finished)return
        if(!applied)throw new Error('Cannot finalize an unapplied inline projection')
        if(this.#blocks.get(blockId)!==state){
          finished=true
          this.#pendingPreparations.delete(retire)
          // The successor can still recover to this candidate. Ownership
          // passed forward when the successor applied its new state.
          if(previous&&this.#blocks.get(blockId)!==previous)this.#destroyState(previous)
          throw new Error('Prepared inline projection owner is stale')
        }
        state.staged=false
        for(const entry of state.widgets.values())entry.scope?.activate?.()
        finished=true
        this.#pendingPreparations.delete(retire)
        if(previous&&previous!==state)this.#destroyState(previous)
      },
      discard:()=>{
        if(finished)return
        if(applied)throw new Error('Applied inline projection must recover or finalize')
        finished=true
        this.#pendingPreparations.delete(retire)
        destroyCandidate()
      },
    })
  }

  serializeBlock(blockId,record,definition,fields,readData){
    this.#assertLive()
    const canonical=richTextFieldMap(definition,record.data)
    const candidate=richTextFieldMap(definition,readData)
    const actual=mountedRichFields(fields,candidate)
    const serialized=new Map()

    for(const [key,element] of actual){
      const html=this.#serializeField(blockId,element)
      serialized.set(key,html)
    }

    let data=cloneEditorData(readData)
    if(typeof definition?.schema?.mapRichText==='function'){
      data=mapRichTextFields(definition,data,(html,key)=>{
        if(serialized.has(key))return serialized.get(key)
        return canonical.has(key)?canonical.get(key):html
      })
    }

    // Only canonical assembly can prune: schema normalization may introduce or
    // remove references, and a detached widget can still belong to a hidden field.
    return {
      data,
      inline:record.inline===undefined?undefined:cloneEditorData(record.inline),
    }
  }

  resolveWidgetElement(target){
    this.#assertLive()
    for(let node=target;node;node=node.parentNode){
      const meta=this.#owned.get(node)
      if(!meta)continue
      const entry=this.#blocks.get(meta.blockId)?.widgets.get(meta.id)
      if(entry?.element===node)return entry.element
    }
    return null
  }

  /** Immutable snapshot of the currently owned rich-field occurrences.
   * The native controller retains these occurrence identities only until the
   * next matching input (or their authority is revoked).
   */
  captureNativeField(blockId,fieldKey,fieldElement){
    this.#assertLive()
    const state=this.#blocks.get(blockId)
    if(!state||!fieldElement?.isConnected)return null
    const occurrences=[]
    for(const entry of state.widgets.values()){
      if(entry.fieldKey!==fieldKey||entry.fieldElement!==fieldElement
        ||!fieldElement.contains(entry.element)||!entry.element.isConnected)continue
      if(!entry.element.isContentEditable)continue
      const definition=this.#registry.getInlineDefinition(entry.type)
      occurrences.push(Object.freeze({
        id:entry.id,type:entry.type,fieldKey,element:entry.element,
        data:cloneEditorData(entry.data),
        beforeText:entry.element.textContent??'',
        optedIn:typeof definition?.editing?.reconcileNative==='function',
        instance:entry.instance,
      }))
    }
    return Object.freeze({blockId,fieldKey,fieldElement,
      occurrences:Object.freeze(occurrences)})
  }

  /** Prove a captured native occurrence is still the same mounted instance. */
  isCurrentNativeOccurrence(blockId,fieldKey,source,{allowDetached=false}={}){
    const entry=this.#blocks.get(blockId)?.widgets.get(source.id)
    return Boolean(entry && entry.type===source.type
      && entry.fieldKey===fieldKey && entry.fieldElement?.isConnected
      && entry.element===source.element && entry.instance===source.instance
      && (allowDetached || entry.fieldElement.contains(entry.element)))
  }

  /** Complete owned inline DOM/cache changes under the DocumentRuntime's
   * existing protected-projection edit guard. A later projection transaction
   * retires removed entries; no new canonical store is introduced.
   */
  applyNativeInlineChanges(blockId,fieldKey,changes){
    this.#assertLive()
    const state=this.#blocks.get(blockId)
    if(!state)throw new Error('Native inline block is no longer mounted')
    for(const change of changes){
      const entry=state.widgets.get(change.id)
      if(!entry||entry.type!==change.type||entry.fieldKey!==fieldKey
        ||entry.element!==change.element||entry.instance!==change.instance){
        throw new Error('Native inline occurrence ownership changed')
      }
      if(change.action.kind==='update')continue
      const text=change.action.kind==='replace-text'?change.action.text:''
      if(text)entry.element.replaceWith(this.#ownerDocument.createTextNode(text))
      else entry.element.remove()
    }
  }

  /** Synchronize surviving owned instance caches against the normalized
   * final canonical sidecar, under the same fallible protected projection
   * boundary. Run even if no revision will change: native DOM may have drifted.
   */
  finalizeNativeInlineUpdates(blockId,fieldKey,changes,canonicalInline){
    this.#assertLive()
    const state=this.#blocks.get(blockId)
    if(!state)throw new Error('Native inline block is no longer mounted')
    for(const change of changes){
      if(change.action.kind!=='update')continue
      const entry=state.widgets.get(change.id)
      if(!entry||entry.element!==change.element||entry.instance!==change.instance
        ||entry.fieldKey!==fieldKey||!entry.fieldElement.contains(entry.element)
        ||typeof entry.instance.update!=='function'){
        throw new Error('Native inline update lost its mounted instance')
      }
      const ref=Object.hasOwn(canonicalInline??{},change.id)
        ?canonicalInline[change.id]:null
      if(!ref||ref.type!==entry.type){
        throw new Error('Native inline update was not retained by canonical assembly')
      }
      const definition=this.#registry.getInlineDefinition(entry.type)
      if(!definition?.schema)throw new Error('Native inline definition is unavailable')
      const decoded=synchronousResult(definition.schema.decode({
        dataVersion:ref.dataVersion,data:cloneEditorData(ref.data),
      }))
      const previous=cloneEditorData(entry.data)
      const next=cloneEditorData(decoded.data)
      entry.instance.update(next,previous)
      entry.data=next
      this.#markWidget(entry)
    }
  }

  /** Release identities removed by one successfully committed native edit. */
  retireNativeInlineChanges(blockId,changes){
    const state=this.#blocks.get(blockId)
    if(!state)return
    for(const change of changes){
      if(change.action.kind==='update')continue
      const entry=state.widgets.get(change.id)
      if(!entry||entry.element!==change.element||entry.instance!==change.instance)continue
      state.widgets.delete(change.id)
      this.#destroyWidget(entry)
    }
  }

  /** Deliver one transient notice to a retained native-edit-aware instance. */
  notifyNativeInlineEdit(blockId,id,notice){
    const entry=this.#blocks.get(blockId)?.widgets.get(id)
    if(!entry||!entry.element.isConnected||typeof entry.instance.afterNativeEdit!=='function')return false
    synchronousResult(entry.instance.afterNativeEdit(Object.freeze({...notice})))
    return true
  }

  resolveWidgetInputTarget(selection,inputType){
    this.#assertLive()
    if(!selection?.isCollapsed||!selection.anchorNode)return null

    const ownedEntry=node=>{
      for(let current=node;current;current=current.parentNode){
        const meta=this.#owned.get(current)
        if(meta){
          const entry=this.#blocks.get(meta.blockId)?.widgets.get(meta.id)
          return entry?.element===current?{meta,entry}:null
        }
      }
      return null
    }

    // Formatting wrappers can sit between a widget and its adjacent text node.
    const ownedAtEdge=(node,side)=>{
      for(let current=node;current;){
        const owned=ownedEntry(current)
        if(owned)return owned
        if(current.nodeType===3){
          if(current.textContent)return null
          current=side==='after'?current.previousSibling:current.nextSibling
        }else{
          current=side==='after'?current.lastChild:current.firstChild
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
      }else if(inputType==='insertText'){
        const text=selection.anchorNode.nodeType===3
        const previous=text
          ?(selection.anchorOffset===0?selection.anchorNode.previousSibling:null)
          :selection.anchorNode.childNodes[selection.anchorOffset-1]??null
        const next=text
          ?(selection.anchorOffset===(selection.anchorNode.textContent?.length??0)?selection.anchorNode.nextSibling:null)
          :selection.anchorNode.childNodes[selection.anchorOffset]??null
        if(previous&&ownedAtEdge(previous,'after')){candidate=previous;position='after'}
        else{candidate=next;position='before'}
      }else if(inputType==='deleteContentForward'){
        if(selection.anchorNode.nodeType===3&&selection.anchorOffset===(selection.anchorNode.textContent?.length??0)){
          candidate=selection.anchorNode.nextSibling
        }else if(selection.anchorNode.nodeType===1){
          candidate=selection.anchorNode.childNodes[selection.anchorOffset]??null
        }
        position='before'
      }
      if(candidate)resolved=ownedAtEdge(candidate,position)
      if(resolved)offset=position==='after'
        ?(resolved.entry.element.textContent?.length??0)
        :0
    }

    if(!resolved)return null
    const {meta,entry}=resolved
    // Editable widget roots are editing hosts, but offsets belong to the block field.
    const field=entry.fieldElement
    if(!field?.contains(entry.element)||!field.contains(selection.anchorNode))return null
    let logicalOffset=0
    try{logicalOffset=getTextOffset(field,entry.element,0)}catch{return null}
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
    const next=value===true
    if(next===this.#readOnly)return

    const changed=[]
    try{
      for(const state of this.#blocks.values()){
        for(const entry of state.widgets.values()){
          changed.push(entry)
          entry.instance.setReadOnly(next)
          this.#markWidget(entry)
        }
      }
      for(const entry of changed)entry.scope?.setReadOnly?.(next)
      this.#readOnly=next
    }catch(error){
      const failures=[error]
      for(let index=changed.length-1;index>=0;index--){
        try{
          changed[index].instance.setReadOnly(this.#readOnly)
          this.#markWidget(changed[index])
        }
        catch(recoveryError){failures.push(recoveryError)}
      }
      if(failures.length>1){
        throw new ReadOnlyRecoveryError(failures,'Inline read-only transition and recovery failed')
      }
      throw error
    }
  }

  destroyBlock(blockId){
    // Block removal revokes detached prepared candidates as well as a
    // mounted state. A candidate must not republish this ID afterward.
    if(this.#projectingBlocks.has(blockId))this.#invalidatedProjectionBlocks.add(blockId)
    const pending=[...this.#pendingPreparations].filter(retire=>retire.blockId===blockId)
    const state=this.#blocks.get(blockId)
    if(state){
      this.#blocks.delete(blockId)
      this.#destroyState(state)
    }
    for(const retire of pending)retire()
  }

  destroy(){
    if(this.#destroyed)return
    this.#destroyed=true
    for(const blockId of [...this.#blocks.keys()])this.destroyBlock(blockId)
    // Also revoke candidates that have not been applied, and predecessors
    // replaced by an applied candidate awaiting finalize/recover.
    for(const retire of [...this.#pendingPreparations])retire()
    this.#pendingPreparations.clear()
  }

  #projectState(blockId,state,record,definition,fields,baseContext,{preserveSourceProjection=false}={}){
    const canonical=richTextFieldMap(definition,record.data)
    const richFields=mountedRichFields(fields,canonical)
    const inline=object(record.inline)
    const counts=new Map()
    for(const html of canonical.values()){
      for(const [id,count] of scanRichTextPlaceholders(html,inline,this.#ownerDocument).occurrences){
        counts.set(id,(counts.get(id)??0)+count)
      }
    }
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
      projectRichTextCaretPadding(element)
    }

    for(const [id,entry] of state.widgets){
      if(live.has(id))continue
      state.widgets.delete(id)
      this.#destroyWidget(entry)
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

      for(const match of richTextPlaceholderMatches(text.data)){
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
        if(entry&&(entry.type!==type||entry.fieldKey!==fieldKey)){
          state.widgets.delete(id)
          this.#destroyWidget(entry)
          entry=null
        }

        if(!entry){
          const Ctor=this.#ownerDocument.defaultView?.AbortController??AbortController
          const controller=new Ctor()
          const scope=new InstanceScope({
            staged:state.staged===true,
            generation:state.generation??0,
            readOnly:this.#readOnly,
          })
          const makeContext=baseContext?.createInlineWidgetContext
          if(typeof makeContext!=='function')throw new Error('Block context does not provide inline widget mutations')
          const context=makeContext(fieldKey,id,type,controller.signal,scope)
          let sourceInstance
          let destroySource
          let instance
          let borrowedLiveRoot=false
          try{
            sourceInstance=runtime.create(id,decoded.data,context)
            destroySource=captureInstanceDestroy(sourceInstance)
            instance=snapshotInlineInstance(sourceInstance,type,destroySource,
              typeof definition.editing?.reconcileNative==='function')
            const root=instance.element
            const HTMLElementCtor=this.#ownerDocument.defaultView?.HTMLElement??globalThis.HTMLElement
            if(!HTMLElementCtor||!(root instanceof HTMLElementCtor)
              ||root.ownerDocument!==this.#ownerDocument){
              throw new TypeError('Inline widget "'+type+'" must return an HTMLElement in the owning document')
            }
            if(liveWidgetRoots.has(root)){
              borrowedLiveRoot=true
              throw new TypeError('Inline widget "'+type+'" must return a fresh HTMLElement')
            }
            if(root.parentNode||root.isConnected){
              throw new TypeError('Inline widget "'+type+'" must return a detached HTMLElement')
            }
          }catch(error){
            try{scope.revoke()}catch{}
            try{controller.abort()}catch{}
            // A duplicate live root belongs to the first occurrence:
            // rejecting its borrower must not call the original disposer.
            if(!borrowedLiveRoot)try{destroySource?.()}catch{}
            throw error
          }
          entry={id,type,fieldKey,fieldElement:element,instance,element:instance.element,controller,scope,data:decoded.data}
          liveWidgetRoots.set(entry.element,entry)
          state.widgets.set(id,entry)
          this.#owned.set(entry.element,{blockId,id})
          instance.setReadOnly(this.#readOnly)
        }else{
          entry.fieldKey=fieldKey
          entry.fieldElement=element
          if(typeof entry.instance.update==='function'&&JSON.stringify(entry.data)!==JSON.stringify(decoded.data)){
            entry.instance.update(decoded.data,entry.data)
          }
          entry.data=decoded.data
          entry.instance.setReadOnly(this.#readOnly)
        }

        // An extension callback may destroy its block/editor before the
        // fragment is published. Never reattach an already disposed widget.
        if(this.#destroyed||(!state.staged&&this.#blocks.get(blockId)!==state)){
          throw new Error('Inline projection owner was revoked during reconciliation')
        }
        this.#markWidget(entry)
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
      if(element.contains(entry.element)){
        this.#markWidget(entry)
        entry.fieldElement=element
        live.add(entry.id)
      }
    }
  }

  #serializeField(blockId,field){
    const container=this.#ownerDocument.createElement('div')
    const append=(source,target)=>{
      for(const node of source.childNodes){
        if(isRichTextCaretPadding(node))continue
        const owned=this.#owned.get(node)
        if(owned?.blockId===blockId&&this.#blocks.get(blockId)?.widgets.get(owned.id)?.element===node){
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
    // Revoke all widget claims before calling potentially reentrant destroy().
    const owned=[...state.widgets.values()]
    state.widgets.clear()
    for(const entry of owned)this.#destroyWidget(entry)
  }

  #markWidget(entry){
    entry.element.setAttribute('data-inline-plugin',entry.type)
    entry.element.setAttribute('data-id',entry.id)
  }

  #destroyWidget(entry){
    try{
      try{entry.scope?.revoke?.()}catch{}
      try{entry.controller?.abort()}catch{}
      try{entry.instance?.destroy?.()}catch{}
      try{entry.element?.remove?.()}catch{}
    }finally{
      // Retain this lease through all reentrant disposer and DOM callbacks.
      if(liveWidgetRoots.get(entry.element)===entry)liveWidgetRoots.delete(entry.element)
    }
  }

  #assertLive(){
    if(this.#destroyed)throw new Error('InlineProjectionRuntime is destroyed')
  }
}
