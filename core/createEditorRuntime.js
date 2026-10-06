// @ts-check
import { EventBus } from '@shelamkoff/event-bus'
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { acquireStyleUrls } from '../shared/styleRegistry.js'
import { invokeObserver } from '../shared/invokeObserver.js'
import { uid } from '../shared/uid.js'
import en from './locale/en.js'
import { I18n } from './I18n.js'
import { LifecycleScope } from './LifecycleScope.js'
import { claimEditorHolder } from './EditorHolderOwnership.js'
import { ExtensionRegistry } from './ExtensionRegistry.js'
import { InlinePopupHost } from './InlinePopupHost.js'
import { InlineProjectionRuntime } from './InlineProjectionRuntime.js'
import { BlockReconciler } from './BlockReconciler.js'
import { DocumentRuntime } from './DocumentRuntime.js'
import { NativeInputController } from './NativeInputController.js'
import { KeyboardRouter } from './KeyboardRouter.js'
import { LogicalSelection } from './LogicalSelection.js'
import { SelectionController } from './SelectionController.js'
import { InteractionState } from './InteractionState.js'
import { EditorViewModel } from './EditorViewModel.js'
import { InlineCommandController } from './InlineCommandController.js'
import { InlineTriggerController } from './InlineTriggerController.js'
import { InlineWidgetInputController } from './InlineWidgetInputController.js'
import { SlashCommandController } from './SlashCommandController.js'
import { EditorBlocksApi, EditorHandle } from './PublicEditorApi.js'
import { ChangeNotifier } from './ChangeNotifier.js'
import { BlockToolbar } from './BlockToolbar.js'
import { ClipboardController } from './ClipboardController.js'
import { DragController } from './DragController.js'
import { InlineToolbar } from './InlineToolbar.js'

const CORE_STYLE_URLS=Object.freeze([
  new URL('./themes/variables.css',import.meta.url).href,
  new URL('./themes/light.css',import.meta.url).href,
  new URL('./themes/dark.css',import.meta.url).href,
])

function initI18n(config){
  const locale=config.locale??en
  const configuredLang=locale?.__lang
  const lang=typeof configuredLang==='string'?configuredLang:'en'
  return new I18n(locale,locale===en?undefined:en,lang)
}

function applyReadOnly(root,value){
  root.classList.toggle('oe-editor--read-only',value)
  if(value)root.setAttribute('aria-readonly','true')
  else root.removeAttribute('aria-readonly')
}

function immutableEventPayload(payload){
  if(payload===undefined)return undefined
  const owned=cloneEditorData(payload)
  const freeze=value=>{
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value
    for(const item of Array.isArray(value)?value:Object.values(value))freeze(item)
    return Object.freeze(value)
  }
  return freeze(owned)
}

function emitSafe(events,type,payload,onError){
  try{events.emit(type,payload)}catch(error){
    if(typeof onError==='function')onError(error)
    else console.warn('[Editor] event observer failed',error)
  }
}

function createDiagnostics(report,thresholds={}){
  const supplied={...thresholds}
  const limits={commandMs:Infinity,saveMs:Infinity,renderMs:Infinity,pasteMs:Infinity}
  for(const name of Object.keys(limits)){
    const value=supplied[name]
    if(value===undefined)continue
    if(!Number.isFinite(value)||value<0)throw new RangeError(`diagnosticThresholds.${name} must be a finite number greater than or equal to 0`)
    limits[name]=value
  }
  return {
    threshold:name=>limits[name],
    now:()=>globalThis.performance?.now?.()??Date.now(),
    emit(code,details={}){
      const diagnostic=Object.freeze({code,timestamp:Date.now(),...details})
      queueMicrotask(()=>invokeObserver(report,[diagnostic]))
    },
    errorName:error=>error instanceof Error&&error.name?error.name:'UnknownError',
  }
}

function snapshotDenseArray(value,label,{required=false}={}){
  if(value===undefined){
    if(required)throw new TypeError(`createEditor() requires a ${label} array`)
    return undefined
  }
  if(!Array.isArray(value))throw new TypeError(`createEditor() ${label} must be an array`)
  const snapshot=[]
  for(let index=0;index<value.length;index++){
    if(!Object.hasOwn(value,index))throw new TypeError(`createEditor() ${label} must be a dense array`)
    snapshot.push(value[index])
  }
  return snapshot
}

function snapshotEditorConfig(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('createEditor() requires a configuration object')
  const config={...input}
  config.plugins=snapshotDenseArray(config.plugins,'plugins',{required:true})
  config.inlinePlugins=snapshotDenseArray(config.inlinePlugins,'inlinePlugins')
  config.inlineTools=snapshotDenseArray(config.inlineTools,'inlineTools')
  for(const removed of ['validationMode','documentVersionPolicy','migrations']){
    if(Object.hasOwn(config,removed))throw new TypeError(`createEditor() ${removed} is no longer supported`)
  }

  if(config.plugins.length===0)throw new TypeError('createEditor() requires a non-empty plugins array')
  if(config.inlineTools){
    const types=new Set()
    for(const tool of config.inlineTools){
      if(!tool||typeof tool!=='object'||typeof tool.type!=='string'||!tool.type)throw new TypeError('createEditor() inline tool must have a non-empty string type')
      if(typeof tool.icon!=='string'||typeof tool.isActive!=='function'||typeof tool.toggle!=='function')throw new TypeError(`createEditor() inline tool "${tool.type}" is invalid`)
      if(types.has(tool.type))throw new Error(`Duplicate inline tool type: ${tool.type}`)
      types.add(tool.type)
    }
  }
  for(const field of ['readOnly','injectStyles','autofocus']){
    if(config[field]!==undefined&&typeof config[field]!=='boolean')throw new TypeError(`createEditor() ${field} must be a boolean`)
  }
  if(config.placeholder!==undefined&&typeof config.placeholder!=='string')throw new TypeError('createEditor() placeholder must be a string')
  if(config.defaultBlock!==undefined&&(typeof config.defaultBlock!=='string'||config.defaultBlock.length===0)){
    throw new TypeError('createEditor() defaultBlock must be a non-empty string')
  }
  if(config.locale!==undefined&&(config.locale===null||typeof config.locale!=='object'||Array.isArray(config.locale))){
    throw new TypeError('createEditor() locale must be an object')
  }
  for(const field of ['onReady','onChange','onValidationError','onDiagnostic']){
    if(config[field]!==undefined&&typeof config[field]!=='function')throw new TypeError(`createEditor() ${field} must be a function`)
  }
  if(config.diagnosticThresholds!==undefined&&(config.diagnosticThresholds===null||typeof config.diagnosticThresholds!=='object'||Array.isArray(config.diagnosticThresholds))){
    throw new TypeError('createEditor() diagnosticThresholds must be an object')
  }
  if(config.theme!==undefined&&(typeof config.theme!=='string'||config.theme.length===0)){
    throw new TypeError('createEditor() theme must be a non-empty string')
  }
  if(config.minHeight!==undefined&&(!Number.isFinite(config.minHeight)||config.minHeight<0)){
    throw new RangeError('createEditor() minHeight must be a finite number greater than or equal to 0')
  }
  for(const field of [
    'changeDebounceMs','historyCoalesceMs','dragThreshold','mobileBreakpoint',
    'blockInsertAnimationMs','blockMoveAnimationMs','blockRemoveAnimationMs',
  ]){
    if(config[field]!==undefined&&(!Number.isFinite(config[field])||config[field]<0)){
      throw new RangeError(`createEditor() ${field} must be a finite number greater than or equal to 0`)
    }
  }
  if(config.historyMaxStack!==undefined&&(!Number.isSafeInteger(config.historyMaxStack)||config.historyMaxStack<1)){
    throw new RangeError('createEditor() historyMaxStack must be a positive safe integer')
  }
  if(config.toolboxFilterThreshold!==undefined&&(!Number.isSafeInteger(config.toolboxFilterThreshold)||config.toolboxFilterThreshold<0)){
    throw new RangeError('createEditor() toolboxFilterThreshold must be a non-negative safe integer')
  }
  return config
}

/**
 * Editor composition root for the canonical document runtime.
 *
 * @param {{
 *   holder: HTMLElement,
 *   plugins: import('../plugin-kit/types').BlockPluginDefinition[],
 *   inlinePlugins?: import('../plugin-kit/types').InlinePluginDefinition[],
 *   inlineTools?: import('../inline-tools/types').InlineTool[],
 *   data?: unknown,
 *   defaultBlock?: string,
 *   placeholder?: string,
 *   readOnly?: boolean,
 *   autofocus?: boolean,
 *   injectStyles?: boolean,
 *   theme?: string,
 *   minHeight?: number,
 *   locale?: Record<string, any>,
 *   onReady?: (editor:any)=>void|Promise<void>,
 *   onChange?: (document:any)=>void|Promise<void>,
 *   onValidationError?: (issue:any)=>void,
 *   onDiagnostic?: (diagnostic:import('./publicTypes').EditorDiagnostic)=>void|Promise<void>,
 *   diagnosticThresholds?: Partial<import('./publicTypes').DiagnosticThresholds>,
 *   changeDebounceMs?: number,
 *   historyMaxStack?: number,
 *   historyCoalesceMs?: number,
 *   dragThreshold?: number,
 *   toolboxFilterThreshold?: number,
 *   mobileBreakpoint?: number,
 *   blockInsertAnimationMs?: number,
 *   blockMoveAnimationMs?: number,
 *   blockRemoveAnimationMs?: number,
 * }} input
 */
export function createEditorRuntime(input){
  const config=snapshotEditorConfig(input)
  const diagnostics=config.onDiagnostic?createDiagnostics(config.onDiagnostic,config.diagnosticThresholds):null
  const reportDiagnostic=(code,operation,error)=>diagnostics?.emit(code,{
    operation,
    errorName:diagnostics.errorName(error),
  })
  const holder=config.holder
  const HTMLElementCtor=holder?.ownerDocument?.defaultView?.HTMLElement??globalThis.HTMLElement
  if(!HTMLElementCtor||!(holder instanceof HTMLElementCtor)){
    const error=new TypeError('createEditor() requires an HTMLElement holder')
    reportDiagnostic('editor.create.failed','createEditor',error)
    throw error
  }

  const originalHolderChildren=[...holder.childNodes]

  let lease
  try{
    lease=claimEditorHolder(holder)
  }catch(error){
    reportDiagnostic('editor.create.failed','createEditor',error)
    throw error
  }
  const lifecycle=new LifecycleScope(error=>reportDiagnostic('cleanup.failed','lifecycle.destroy',error))
  lifecycle.register(lease)
  try{
  const document=holder.ownerDocument
  const root=document.createElement('div')
  lifecycle.register({destroy(){root.remove()}})
  root.className='oe-editor oe-theme-'+(config.theme??'dark')
  root.tabIndex=-1
  if(config.minHeight!==undefined)root.style.minHeight=String(config.minHeight)+'px'
  const mobileBreakpoint=config.mobileBreakpoint??768
  const updateViewportMode=()=>root.classList.toggle(
    'oe-editor--mobile',
    (document.defaultView?.innerWidth??Infinity)<mobileBreakpoint,
  )
  updateViewportMode()
  const onViewportResize=()=>updateViewportMode()
  document.defaultView?.addEventListener?.('resize',onViewportResize)
  lifecycle.register({destroy(){document.defaultView?.removeEventListener?.('resize',onViewportResize)}})
  const blocksElement=document.createElement('div')
  blocksElement.className='oe-blocks'
  const clickArea=document.createElement('div')
  clickArea.className='oe-click-area'
  root.append(blocksElement,clickArea)
  holder.replaceChildren(root)

  const events=new EventBus()
  const emit=(type,payload)=>emitSafe(events,type,immutableEventPayload(payload),error=>reportDiagnostic('command.failed',`event:${type}`,error))
  const i18n=initI18n(config)
  const configuredInlineTools=config.inlineTools??[]
  let runtime
  let reconciler
  let logicalSelection
  let interaction
  let view
  let notifier
  let toolbar=null
  let clipboard=null
  let destroyed=false
  let ready=false

  const popup=lifecycle.register(new InlinePopupHost({
    root,
    isReadOnly:()=>runtime?.readOnly??(config.readOnly===true),
  }))

  const registry=lifecycle.register(new ExtensionRegistry({
    ownerDocument:document,
    blocks:config.plugins,
    inline:config.inlinePlugins??[],
    defaultBlock:config.defaultBlock,
    placeholder:config.placeholder,
    acquireStyles:config.injectStyles!==false,
    translate:(key,fallback='',params=undefined)=>{
      const translated=i18n.t(key,params)
      return translated===key?fallback:translated
    },
    showPopup:(anchor,content,cleanup)=>popup.showPopup(anchor,content,cleanup),
    hidePopup:()=>popup.hidePopup(),
  }))

  const styles=config.injectStyles===false?null:lifecycle.register(acquireStyleUrls(CORE_STYLE_URLS,document))
  const inlineProjection=new InlineProjectionRuntime({
    registry,
    ownerDocument:document,
    readOnly:config.readOnly===true,
  })

  let crossSelection=null
  const selectionPort={
    capture:()=>crossSelection?.bookmark??logicalSelection?.capture()??null,
    restore:bookmark=>{
      if(bookmark?.anchor.blockId!==bookmark?.focus.blockId&&crossSelection?.restore(bookmark))return true
      return logicalSelection?.restore(bookmark)
    },
  }

  let keyboardRouter=null

  runtime=lifecycle.register(new DocumentRuntime({
    registry,
    data:config.data,
    ownerDocument:document,
    readOnly:config.readOnly===true,
    createId:prefix=>prefix+'-'+uid(),
    selection:selectionPort,
    onValidationError:config.onValidationError,
    history:{maxStack:config.historyMaxStack??100},
    diagnostics,
    requestSplit:id=>keyboardRouter?.split(id),
    requestExit:id=>keyboardRouter?.exit(id),
    onCommit:event=>{
      interaction?.reconcile()
      toolbar?.refresh()
      clipboard?.handleTransaction(event)
      notifier?.schedule()
      emit('transaction:committed',event)
      emit('document:changed',{
        origin:event.origin,
        action:event.action,
        changes:event.changes,
      })
      emit('history:changed',event.history)
    },
    projectorFactory:({activationResolver,contextFactory})=>{
      reconciler=new BlockReconciler({
        container:blocksElement,
        registry,
        contextFactory,
        activationResolver,
        inlineProjection,
        readOnly:config.readOnly===true,
        animationDurations:{
          insertMs:config.blockInsertAnimationMs??350,
          moveMs:config.blockMoveAnimationMs??200,
          removeMs:config.blockRemoveAnimationMs??350,
        },
      })
      return reconciler
    },
  }))

  logicalSelection=new LogicalSelection({root,reconciler})
  interaction=new InteractionState({
    runtime,
    reconciler,
    onChange:change=>{
      if(change.previousCurrentId!==change.currentId){
        emit('currentBlock:changed',{currentId:change.currentId})
      }
      const previous=change.previousSelectedIds
      const selected=change.selectedIds
      if(previous.length!==selected.length||previous.some((id,index)=>id!==selected[index])){
        emit('selection:changed',{selectedIds:selected})
      }
    },
  })
  view=new EditorViewModel({runtime,reconciler,interaction,selection:logicalSelection})
  crossSelection=lifecycle.register(new SelectionController({root,runtime,reconciler,view}))
  const inlineWidgetInput=lifecycle.register(new InlineWidgetInputController({
    root,
    runtime,
    registry,
    projection:inlineProjection,
    selection:logicalSelection,
  }))
  const nativeInput=lifecycle.register(new NativeInputController({
    root,
    runtime,
    reconciler,
    crossSelection,
    selection:logicalSelection,
    coalesceMs:config.historyCoalesceMs??300,
  }))
  let triggerController=null
  const inlineCommands=new InlineCommandController({
    runtime,
    registry,
    selection:logicalSelection,
    onFreshText:()=>queueMicrotask(()=>triggerController?.refresh()),
  })
  const triggers=lifecycle.register(new InlineTriggerController({
    root,
    registry,
    reconciler,
    selection:logicalSelection,
    commands:inlineCommands,
    isComposing:()=>nativeInput.isComposing,
    projection:inlineProjection,
  }))
  triggerController=triggers

  const slashCommands=lifecycle.register(new SlashCommandController({
    root,
    runtime,
    registry,
    reconciler,
    selection:logicalSelection,
    view,
    inlineCommands,
    isComposing:()=>nativeInput.isComposing,
    translate:(key,fallback='')=>{
      const translated=i18n.t(key)
      return translated===key?fallback:translated
    },
    t:(key,fallback='')=>{
      const translated=i18n.t(key)
      return translated===key?fallback:translated
    },
  }))

  clipboard=lifecycle.register(new ClipboardController({
    root,
    runtime,
    registry,
    reconciler,
    selection:logicalSelection,
    view,
    crossSelection,
    inlineCommands,
    diagnostics,
  }))

  toolbar=lifecycle.register(new BlockToolbar({
    root,
    runtime,
    registry,
    view,
    selection:logicalSelection,
    selectionPort:crossSelection,
    inlineCommands,
    translate:(key,fallback='')=>{
      const translated=i18n.t(key)
      return translated===key?fallback:translated
    },
    t:(key,fallback='')=>{
      const translated=i18n.t(key)
      return translated===key?fallback:translated
    },
    filterThreshold:config.toolboxFilterThreshold??7,
  }))

  const drag=lifecycle.register(new DragController({
    runtime,
    view,
    handle:toolbar.dragHandle,
    threshold:config.dragThreshold??5,
  }))

  const inlineToolbar=lifecycle.register(new InlineToolbar({
    root,
    runtime,
    registry,
    reconciler,
    selection:logicalSelection,
    selectionPort:crossSelection,
    view,
    tools:configuredInlineTools,
    translate:(key,fallback='',params=undefined)=>{
      const translated=i18n.t(key,params)
      return translated===key?fallback:translated
    },
  }))

  keyboardRouter=lifecycle.register(new KeyboardRouter({
    root,
    runtime,
    registry,
    reconciler,
    selection:logicalSelection,
    view,
    inlineToolbar,
    crossSelection,
    isComposing:()=>nativeInput.isComposing,
  }))

  const onClickAreaMouseDown=event=>{
    if(event.button===0&&!runtime.readOnly)event.preventDefault()
  }
  const onClickArea=event=>{
    if(event.target===clickArea)keyboardRouter.appendDefault()
  }
  clickArea.addEventListener('mousedown',onClickAreaMouseDown)
  clickArea.addEventListener('click',onClickArea)
  lifecycle.register({destroy(){
    clickArea.removeEventListener('mousedown',onClickAreaMouseDown)
    clickArea.removeEventListener('click',onClickArea)
  }})

  const onFocusIn=event=>{
    const blockId=reconciler.resolveBlockTarget(event.target)
    if(blockId){
      interaction.setCurrent(blockId)
      toolbar?.showFor(blockId)
    }
  }
  root.addEventListener('focusin',onFocusIn)
  lifecycle.register({destroy(){root.removeEventListener('focusin',onFocusIn)}})

  notifier=lifecycle.register(new ChangeNotifier(
    ()=>runtime.save(),
    config.onChange,
    Number.isFinite(config.changeDebounceMs)?Math.max(0,Number(config.changeDebounceMs)):250,
    document.defaultView??globalThis,
    error=>reportDiagnostic('save.failed','onChange',error),
  ))

  applyReadOnly(root,runtime.readOnly)

  const blocks=new EditorBlocksApi({runtime,view,selection:crossSelection,isDestroyed:()=>destroyed})
  let editor
  const destroy=()=>{
    if(destroyed)return
    destroyed=true
    ready=false
    lifecycle.destroy()
    emit('editor:destroyed')
  }
  const setReadOnly=value=>runtime.setReadOnly(value,discardProjectionEdits=>{
    popup.setReadOnly(runtime.readOnly)
    applyReadOnly(root,runtime.readOnly)
    toolbar?.setReadOnly(runtime.readOnly)
    inlineToolbar.setReadOnly(runtime.readOnly)
    nativeInput.setReadOnly(runtime.readOnly,discardProjectionEdits)
    drag.setReadOnly(runtime.readOnly)
    emit('readOnly:changed',{readOnly:runtime.readOnly})
    emit('history:changed',{canUndo:runtime.canUndo,canRedo:runtime.canRedo})
  })

  editor=new EditorHandle({
    runtime,
    view,
    blocks,
    destroy,
    setReadOnly,
    inlineCommands,
    subscribe:(type,listener)=>events.on(type,payload=>{
      invokeObserver(listener,[payload],error=>reportDiagnostic('command.failed',`event:${type}`,error))
    }),
    isReady:()=>ready,
    isDestroyed:()=>destroyed,
  })

  if(config.autofocus&&!runtime.readOnly)view.focus()

  queueMicrotask(()=>{
    if(destroyed)return
    ready=true
    emit('editor:ready')
    invokeObserver(config.onReady,[editor],error=>reportDiagnostic('command.failed','onReady',error))
  })

  return editor
  }catch(error){
    lifecycle.destroy()
    holder.replaceChildren(...originalHolderChildren)
    reportDiagnostic('editor.create.failed','createEditor',error)
    throw error
  }
}
