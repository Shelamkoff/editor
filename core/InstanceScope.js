// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

export function createAbortError(message='Instance scope is revoked'){
  if(typeof DOMException==='function')return new DOMException(message,'AbortError')
  const error=new Error(message)
  error.name='AbortError'
  return error
}

function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value
  for(const item of Array.isArray(value)?value:Object.values(value))deepFreeze(item)
  return Object.freeze(value)
}

function snapshot(value){
  return deepFreeze(cloneEditorData(value))
}

export class InstanceScope{
  #state
  #token=Symbol('instance-scope')
  #generation
  #readOnly
  #inheritedReadOnly=false
  #interactionEpoch=0
  #tasks=new Set()
  #children=new Set()
  #parent=null
  #health=()=> 'ready'
  #phase=()=> 'idle'
  #currentGeneration
  #currentRevision=()=>0
  #signal=null
  #abortListener=null

  constructor({staged=false,generation=0,readOnly=false,parent=null}={}){
    this.#state=staged?'staged':'active'
    this.#generation=Number.isSafeInteger(generation)&&generation>0?generation:0
    this.#readOnly=readOnly===true
    this.#currentGeneration=()=>this.#generation
    if(parent)this.attachParent(parent)
  }

  get token(){return this.#token}
  get state(){return this.#state}
  get active(){return this.#state==='active'}
  get staged(){return this.#state==='staged'}
  get revoked(){return this.#state==='revoked'}
  get generation(){return this.#generation}
  get interactionEpoch(){return this.#interactionEpoch}
  get readOnly(){return this.#state==='revoked'||this.#readOnly||this.#inheritedReadOnly}

  /** @param {{generation?:number,readOnly?:boolean,health?:()=>string,phase?:()=>string,currentGeneration?:()=>number,currentRevision?:()=>number,signal?:AbortSignal,parent?:InstanceScope}} [options] */
  configure({generation,readOnly,health,phase,currentGeneration,currentRevision,signal,parent}={}){
    if(this.#state==='revoked')throw createAbortError()
    if(Number.isSafeInteger(generation)&&generation>0)this.#generation=generation
    if(typeof readOnly==='boolean')this.setReadOnly(readOnly)
    if(typeof health==='function')this.#health=health
    if(typeof phase==='function')this.#phase=phase
    if(typeof currentGeneration==='function')this.#currentGeneration=currentGeneration
    if(typeof currentRevision==='function')this.#currentRevision=currentRevision
    if(parent)this.attachParent(parent)

    if(signal&&signal!==this.#signal){
      if(this.#signal&&this.#abortListener){
        try{this.#signal.removeEventListener('abort',this.#abortListener)}catch{}
      }
      this.#signal=signal
      this.#abortListener=()=>this.revoke()
      if(signal.aborted)this.revoke()
      else signal.addEventListener('abort',this.#abortListener,{once:true})
    }
    return this
  }

  attachParent(parent){
    if(!(parent instanceof InstanceScope))throw new TypeError('Instance scope parent must be an InstanceScope')
    if(this.#state==='revoked')throw createAbortError()
    if(this.#parent===parent)return
    if(this.#parent)throw new Error('Instance scope already has a parent')
    // Do not recreate authority underneath a terminal parent.
    if(parent.revoked){
      this.revoke()
      throw createAbortError('Instance scope parent is revoked')
    }
    // Ownership must remain a tree. A cycle would recurse without limit
    // during read-only propagation and make later revocation ambiguous.
    for(let ancestor=parent;ancestor;ancestor=ancestor.#parent){
      if(ancestor===this)throw new Error('Instance scope parent cycle')
    }
    this.#parent=parent
    parent.#children.add(this)
    this.#setInheritedReadOnly(parent.readOnly)
  }

  activate(generation=this.#generation){
    if(this.#state==='revoked')throw createAbortError()
    if(Number.isSafeInteger(generation)&&generation>0)this.#generation=generation
    this.#state='active'
  }

  revoke(){
    if(this.#state==='revoked')return false
    this.#state='revoked'
    this.#interactionEpoch++
    this.#cancelTasks()
    for(const child of [...this.#children])child.revoke()
    this.#children.clear()
    if(this.#parent)this.#parent.#children.delete(this)
    this.#parent=null
    if(this.#signal&&this.#abortListener){
      try{this.#signal.removeEventListener('abort',this.#abortListener)}catch{}
    }
    this.#signal=null
    this.#abortListener=null
    return true
  }

  setReadOnly(value){
    if(this.#state==='revoked')return
    const previous=this.readOnly
    this.#readOnly=value===true
    this.#settleReadOnly(previous)
  }

  // Parent mode is an inherited restriction, never the child's local choice.
  #setInheritedReadOnly(value){
    if(this.#state==='revoked')return
    const previous=this.readOnly
    this.#inheritedReadOnly=value===true
    this.#settleReadOnly(previous)
  }

  #settleReadOnly(previous){
    const next=this.readOnly
    if(previous!==next){
      this.#interactionEpoch++
      this.#cancelTasks()
    }
    // Propagate the effective restriction without overwriting local flags.
    for(const child of this.#children)child.#setInheritedReadOnly(this.readOnly)
  }

  assertReadable(){
    if(this.#state==='revoked')throw createAbortError()
    const epoch=this.#interactionEpoch
    if(this.#health()!=='ready')throw createAbortError('Instance runtime is not ready')
    // Health is an injected observer and can synchronously revoke this scope.
    if(this.#state==='revoked'||this.#interactionEpoch!==epoch)throw createAbortError()
  }

  runMutation(operation){
    if(typeof operation!=='function')throw new TypeError('Instance mutation requires an operation')
    if(!this.#canMutate())return false
    operation()
    return true
  }

  createAuthority({readData,updateData,commitDomMutation,createId}){
    if(typeof readData!=='function')throw new TypeError('Instance authority requires readData()')
    if(typeof updateData!=='function')throw new TypeError('Instance authority requires updateData()')

    const getData=()=>{
      const epoch=this.#interactionEpoch
      const generation=this.#generation
      this.assertReadable()
      const owned=snapshot(readData())
      // The read callback and its JSON snapshot are synchronous external
      // boundaries. A retired occurrence must not return its author data.
      if(epoch!==this.#interactionEpoch||generation!==this.#generation)throw createAbortError()
      this.assertReadable()
      return owned
    }
    const update=(producer,options)=>{
      if(typeof producer!=='function')throw new TypeError('updateData() requires a producer')
      const epoch=this.#interactionEpoch
      const generation=this.#generation
      if(!this.#canMutate()||!this.#stillOwnInteraction(epoch,generation))return
      updateData(current=>{
        const owned=snapshot(current)
        // The canonical input can include getter-backed values, and both
        // snapshotting and the producer can retire this occurrence. Never
        // forward an obsolete result into the owning document transaction.
        if(!this.#stillOwnInteraction(epoch,generation))throw createAbortError()
        const next=producer(owned)
        if(!this.#stillOwnInteraction(epoch,generation))throw createAbortError()
        return next
      },options)
    }
    const commitDom=operation=>{
      if(typeof operation!=='function')throw new TypeError('commitDomMutation() requires an operation')
      const epoch=this.#interactionEpoch
      const generation=this.#generation
      if(!this.#canMutate()||!this.#stillOwnInteraction(epoch,generation))return
      // A host may defer the DOM callback or revoke its owner while setting
      // up projection synchronization. Pass only a revocable producer, not
      // the original author callback. Recheck at invocation time without
      // requiring phase==='idle': the host legitimately invokes it while
      // its own projection-edit phase is active.
      return commitDomMutation?.((...args)=>{
        if(!this.#stillOwnInteraction(epoch,generation))return
        const currentGeneration=this.#currentGeneration()
        if(currentGeneration!==generation||!this.#stillOwnInteraction(epoch,generation))return
        return operation(...args)
      })
    }
    const allocate=prefix=>{
      const epoch=this.#interactionEpoch
      const generation=this.#generation
      this.assertReadable()
      if(typeof createId!=='function')throw new Error('Instance context has no id allocator')
      const id=createId(prefix)
      // An allocator may synchronously destroy the editor or complete a
      // read-only round trip before returning its proposed identifier.
      if(epoch!==this.#interactionEpoch||generation!==this.#generation)throw createAbortError()
      this.assertReadable()
      return id
    }

    return Object.freeze({
      getData,
      updateData:update,
      commitDomMutation:commitDom,
      createId:allocate,
      isReadOnly:()=>this.readOnly,
      beginTask:()=>this.#beginTask(updateData),
    })
  }

  #stillOwnInteraction(epoch,generation){
    return this.#state==='active'
      && !this.readOnly
      && this.#interactionEpoch===epoch
      && this.#generation===generation
  }

  #canMutate(){
    if(this.#state==='revoked')return false
    if(this.#state!=='active')throw new Error('Instance context is staged')
    const epoch=this.#interactionEpoch
    const generation=this.#generation
    if(this.readOnly||this.#health()!=='ready'
      ||!this.#stillOwnInteraction(epoch,generation))return false
    const phase=this.#phase()
    if(!this.#stillOwnInteraction(epoch,generation))return false
    if(phase!=='idle')throw new Error(`Cannot mutate instance context during ${phase} phase`)
    if(this.#parent&&!this.#parent.#canMutate())return false
    // A parent health/phase callback can revoke this descendant while
    // returning a deceptively valid old decision.
    return this.#stillOwnInteraction(epoch,generation)
  }

  #beginTask(updateData){
    const epoch=this.#interactionEpoch
    const generation=this.#generation
    if(this.#state!=='active'||this.readOnly||this.#health()!=='ready'
      ||!this.#stillOwnInteraction(epoch,generation)){
      throw createAbortError('Cannot begin a data task for an inactive instance context')
    }
    const phase=this.#phase()
    if(!this.#stillOwnInteraction(epoch,generation)){
      throw createAbortError('Cannot begin a data task for an inactive instance context')
    }
    if(phase!=='idle')throw new Error(`Cannot begin a data task during ${phase} phase`)
    if(this.#parent && !this.#parent.#canMutate()){
      throw createAbortError('Cannot begin a data task for an inactive parent scope')
    }
    if(!this.#stillOwnInteraction(epoch,generation)){
      throw createAbortError('Cannot begin a data task for an inactive instance context')
    }
    // Even the revision source is a callback: it can synchronously revoke
    // this scope or cause a read-only round trip while returning a number.
    const baseRevision=this.#currentRevision()
    if(!this.#stillOwnInteraction(epoch,generation)){
      throw createAbortError('Cannot begin a data task for an inactive instance context')
    }
    const controller=new AbortController()
    if(!this.#stillOwnInteraction(epoch,generation)){
      controller.abort()
      throw createAbortError('Cannot begin a data task for an inactive instance context')
    }
    const task={
      baseRevision,
      controller,
      epoch:this.#interactionEpoch,
      generation:this.#generation,
      closed:false,
      committing:false,
    }
    this.#tasks.add(task)

    const close=abort=>{
      if(task.closed)return
      task.closed=true
      this.#tasks.delete(task)
      if(abort&&!controller.signal.aborted)controller.abort()
    }

    return Object.freeze({
      signal:controller.signal,
      commit:(producer,options)=>{
        if(typeof producer!=='function')throw new TypeError('DataTask.commit() requires a producer')
        const field=options?.mergeWithPreviousField
        if(field!==undefined&&(typeof field!=='string'||!field||field.length>128)){
          throw new TypeError('History continuation field must be a non-empty string')
        }
        if(task.closed||task.committing||controller.signal.aborted)return false
        if(
          this.#state!=='active'
          ||this.readOnly
          ||this.#health()!=='ready'
          ||this.#interactionEpoch!==task.epoch
          ||this.#generation!==task.generation
          ||this.#currentGeneration()!==task.generation
          ||(this.#parent&&!this.#parent.#canMutate())
          ||!this.#stillOwnInteraction(task.epoch,task.generation)
          ||task.closed||controller.signal.aborted
        ){
          close(true)
          return false
        }
        const currentPhase=this.#phase()
        // The phase check is itself a callback. A plugin can synchronously
        // revoke this task while claiming that the old phase was still idle.
        if(!this.#stillOwnInteraction(task.epoch,task.generation)
          ||task.closed||controller.signal.aborted){
          close(true)
          return false
        }
        if(currentPhase!=='idle')throw new Error(`Cannot commit a data task during ${currentPhase} phase`)
        task.committing=true
        try{
          const continuation=field!==undefined&&Number.isSafeInteger(task.baseRevision)&&task.baseRevision>0
            ?{historyContinuation:{baseRevision:task.baseRevision,fieldKey:field}}
            :undefined
          updateData(current=>{
            const owned=snapshot(current)
            if(task.closed||controller.signal.aborted
              ||!this.#stillOwnInteraction(task.epoch,task.generation))throw createAbortError()
            const next=producer(owned)
            if(task.closed||controller.signal.aborted
              ||!this.#stillOwnInteraction(task.epoch,task.generation))throw createAbortError()
            return next
          },continuation)
          close(false)
          return true
        }catch(error){
          close(true)
          throw error
        }finally{
          task.committing=false
        }
      },
      cancel(){close(true)},
    })
  }

  #cancelTasks(){
    for(const task of [...this.#tasks]){
      task.closed=true
      this.#tasks.delete(task)
      if(!task.controller.signal.aborted)task.controller.abort()
    }
  }
}
