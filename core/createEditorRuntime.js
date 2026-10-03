// @ts-check
import { EventBus } from '@shelamkoff/event-bus'
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
import { Diagnostics } from './Diagnostics.js'

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

function emitSafe(events,type,payload,onError){
  try{events.emit(type,payload)}catch(error){
    if(typeof onError==='function')onError(error)
    else console.warn('[Editor] event observer failed',error)
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
  config.migrations=snapshotDenseArray(config.migrations,'migrations')

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
  if(config.validationMode!==undefined&&!['preserve','strict'].includes(config.validationMode)){
    throw new TypeError('createEditor() validationMode must be "preserve" or "strict"')
  }
  if(config.documentVersionPolicy!==undefined&&!['preserve','strict'].includes(config.documentVersionPolicy)){
    throw new TypeError('createEditor() documentVersionPolicy must be "preserve" or "strict"')
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
 *   validationMode?: 'preserve'|'strict',
 *   documentVersionPolicy?: 'preserve'|'strict',
 *   migrations?: readonly import('./publicTypes').DocumentMigration[],
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
  const diagnostics=new Diagnostics(config.onDiagnostic,config.diagnosticThresholds)
  const reportDiagnostic=(code,operation,error)=>diagnostics.emit(code,{
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
  const emit=(type,payload)=>emitSafe(events,type,payload,error=>reportDiagnostic('command.failed',`event:${type}`,error))
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
    translate:(key,fallback='')=>{
      const translated=i18n.t(key)
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

  const selectionPort={
    capture:()=>logicalSelection?.capture()??null,
    restore:bookmark=>logicalSelection?.restore(bookmark),
  }

  let keyboardRouter=null

  runtime=lifecycle.register(new DocumentRuntime({
    registry,
    data:config.data,
    ownerDocument:document,
    validationMode:config.validationMode,
    documentVersionPolicy:config.documentVersionPolicy,
    migrations:config.migrations,
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
      clipboard?.handleTransaction(event)
      notifier?.schedule()
      emit('transaction:committed',event)
      emit('document:changed',{
        origin:event.origin,
        action:event.action,
        changes:event.record?.changes??[],
      })
      emit('history:changed',{canUndo:runtime?.canUndo===true,canRedo:runtime?.canRedo===true})
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
  const crossSelection=lifecycle.register(new SelectionController({root,runtime,reconciler,view}))
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
    diagnostics,
  }))

  toolbar=lifecycle.register(new BlockToolbar({
    root,
    runtime,
    registry,
    view,
    selection:logicalSelection,
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
    view,
    tools:configuredInlineTools,
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

  const blocks=new EditorBlocksApi({runtime,view,isDestroyed:()=>destroyed})
  let editor
  const destroy=()=>{
    if(destroyed)return
    destroyed=true
    ready=false
    lifecycle.destroy()
    emit('editor:destroyed')
  }
  const setReadOnly=value=>{
    runtime.setReadOnly(value)
    popup.setReadOnly(runtime.readOnly)
    applyReadOnly(root,runtime.readOnly)
    toolbar?.setReadOnly(runtime.readOnly)
    inlineToolbar.setReadOnly(runtime.readOnly)
    nativeInput.setReadOnly(runtime.readOnly)
    emit('readOnly:changed',{readOnly:runtime.readOnly})
    emit('history:changed',{canUndo:runtime.canUndo,canRedo:runtime.canRedo})
  }

  editor=new EditorHandle({
    runtime,
    view,
    blocks,
    destroy,
    setReadOnly,
    inlineCommands,
    subscribe:(type,listener)=>events.on(type,listener),
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
    reportDiagnostic('editor.create.failed','createEditor',error)
    throw error
  }
}
