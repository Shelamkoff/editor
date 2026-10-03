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
  #interactionEpoch=0
  #tasks=new Set()
  #children=new Set()
  #parent=null
  #health=()=> 'ready'
  #phase=()=> 'idle'
  #currentGeneration
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
  get readOnly(){return this.#state==='revoked'||this.#readOnly}

  configure({generation,readOnly,health,phase,currentGeneration,signal,parent}={}){
    if(this.#state==='revoked')throw createAbortError()
    if(Number.isSafeInteger(generation)&&generation>0)this.#generation=generation
    if(typeof readOnly==='boolean')this.#readOnly=readOnly
    if(typeof health==='function')this.#health=health
    if(typeof phase==='function')this.#phase=phase
    if(typeof currentGeneration==='function')this.#currentGeneration=currentGeneration
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
    if(this.#parent===parent)return
    if(this.#parent)throw new Error('Instance scope already has a parent')
    this.#parent=parent
    parent.#children.add(this)
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
    this.#parent?.#children.delete(this)
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
    const next=value===true
    if(this.#readOnly!==next){
      this.#readOnly=next
      this.#interactionEpoch++
      this.#cancelTasks()
    }
    for(const child of this.#children)child.setReadOnly(next)
  }

  assertReadable(){
    if(this.#state==='revoked')throw createAbortError()
    if(this.#health()!=='ready')throw createAbortError('Instance runtime is not ready')
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
      this.assertReadable()
      return snapshot(readData())
    }
    const update=producer=>{
      if(typeof producer!=='function')throw new TypeError('updateData() requires a producer')
      if(!this.#canMutate())return
      updateData(current=>producer(snapshot(current)))
    }
    const commitDom=operation=>{
      if(typeof operation!=='function')throw new TypeError('commitDomMutation() requires an operation')
      if(!this.#canMutate())return
      return commitDomMutation?.(operation)
    }
    const allocate=prefix=>{
      this.assertReadable()
      if(typeof createId!=='function')throw new Error('Instance context has no id allocator')
      return createId(prefix)
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

  #canMutate(){
    if(this.#state==='revoked')return false
    if(this.#state!=='active')throw new Error('Instance context is staged')
    if(this.#readOnly||this.#health()!=='ready')return false
    const phase=this.#phase()
    if(phase!=='idle')throw new Error(`Cannot mutate instance context during ${phase} phase`)
    return true
  }

  #beginTask(updateData){
    if(this.#state!=='active'||this.#readOnly||this.#health()!=='ready'){
      throw createAbortError('Cannot begin a data task for an inactive instance context')
    }
    const phase=this.#phase()
    if(phase!=='idle')throw new Error(`Cannot begin a data task during ${phase} phase`)

    const controller=new AbortController()
    const task={
      controller,
      epoch:this.#interactionEpoch,
      generation:this.#generation,
      closed:false,
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
      commit:producer=>{
        if(typeof producer!=='function')throw new TypeError('DataTask.commit() requires a producer')
        if(task.closed||controller.signal.aborted)return false
        if(
          this.#state!=='active'
          ||this.#readOnly
          ||this.#health()!=='ready'
          ||this.#interactionEpoch!==task.epoch
          ||this.#generation!==task.generation
          ||this.#currentGeneration()!==task.generation
        ){
          close(true)
          return false
        }
        const currentPhase=this.#phase()
        if(currentPhase!=='idle')throw new Error(`Cannot commit a data task during ${currentPhase} phase`)
        try{
          updateData(current=>producer(snapshot(current)))
          close(false)
          return true
        }catch(error){
          close(true)
          throw error
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
