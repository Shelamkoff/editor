// @ts-check
import { EventBus } from '@shelamkoff/event-bus'
import { acquireStyleUrls } from '../shared/styleRegistry.js'
import { invokeObserver } from '../shared/invokeObserver.js'
import { uid } from '../shared/uid.js'
import en from './locale/en.js'
import { I18n } from './I18n.js'
import { claimEditorHolder } from './EditorHolderOwnership.js'
import { ExtensionRegistry } from './ExtensionRegistry.js'
import { InlinePopupHost } from './InlinePopupHost.js'
import { InlineProjectionRuntime } from './InlineProjectionRuntime.js'
import { BlockReconciler } from './BlockReconciler.js'
import { DocumentRuntime } from './DocumentRuntime.js'
import { NativeInputController } from './NativeInputController.js'
import { KeyboardRouter } from './KeyboardRouter.js'
import { LogicalSelection } from './LogicalSelection.js'
import { SelectionControllerV2 } from './SelectionControllerV2.js'
import { InteractionState } from './InteractionState.js'
import { EditorViewModel } from './EditorViewModel.js'
import { InlineCommandController } from './InlineCommandController.js'
import { InlineTriggerController } from './InlineTriggerController.js'
import { EditorBlocksApiV2, EditorHandleV2 } from './PublicEditorApiV2.js'
import { ChangeNotifier } from './ChangeNotifier.js'
import { BlockToolbarV2 } from './BlockToolbarV2.js'
import { ClipboardControllerV2 } from './ClipboardControllerV2.js'
import { DragControllerV2 } from './DragControllerV2.js'
import { InlineToolbarV2 } from './InlineToolbarV2.js'

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

function emitSafe(events,type,payload){
  try{events.emit(type,payload)}catch(error){console.warn('[Editor] event observer failed',error)}
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
  for(const field of ['onReady','onChange','onValidationError']){
    if(config[field]!==undefined&&typeof config[field]!=='function')throw new TypeError(`createEditor() ${field} must be a function`)
  }
  if(config.theme!==undefined&&config.theme!=='light'&&config.theme!=='dark'){
    throw new TypeError('createEditor() theme must be "light" or "dark"')
  }
  if(config.minHeight!==undefined&&(!Number.isFinite(config.minHeight)||config.minHeight<0)){
    throw new RangeError('createEditor() minHeight must be a finite number greater than or equal to 0')
  }
  if(config.changeDebounceMs!==undefined&&(!Number.isFinite(config.changeDebounceMs)||config.changeDebounceMs<0)){
    throw new RangeError('createEditor() changeDebounceMs must be a finite number greater than or equal to 0')
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
 * Pure v2 composition root.
 *
 * This factory intentionally imports none of the legacy BlockManager/Block/
 * UndoManager/CommandDispatcher/InlinePluginRegistry stack.
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
 *   theme?: 'light'|'dark',
 *   minHeight?: number,
 *   locale?: Record<string, any>,
 *   validationMode?: 'preserve'|'strict',
 *   documentVersionPolicy?: 'preserve'|'strict',
 *   migrations?: readonly import('./publicTypes').DocumentMigration[],
 *   onReady?: (editor:any)=>void|Promise<void>,
 *   onChange?: (document:any)=>void|Promise<void>,
 *   onValidationError?: (issue:any)=>void,
 *   changeDebounceMs?: number,
 * }} input
 */
export function createEditorV2(input){
  const config=snapshotEditorConfig(input)
  const holder=config.holder
  const HTMLElementCtor=holder?.ownerDocument?.defaultView?.HTMLElement??globalThis.HTMLElement
  if(!HTMLElementCtor||!(holder instanceof HTMLElementCtor))throw new TypeError('createEditor() requires an HTMLElement holder')

  const lease=claimEditorHolder(holder)
  const document=holder.ownerDocument
  const root=document.createElement('div')
  root.className='oe-editor oe-theme-'+(config.theme??'light')
  root.tabIndex=-1
  if(config.minHeight!==undefined)root.style.minHeight=String(config.minHeight)+'px'
  const blocksElement=document.createElement('div')
  blocksElement.className='oe-blocks'
  const clickArea=document.createElement('div')
  clickArea.className='oe-click-area'
  root.append(blocksElement,clickArea)
  holder.replaceChildren(root)

  const events=new EventBus()
  const i18n=initI18n(config)
  let runtime
  let reconciler
  let logicalSelection
  let interaction
  let view
  let notifier
  let toolbar=null
  let destroyed=false

  const popup=new InlinePopupHost({
    root,
    isReadOnly:()=>runtime?.readOnly??(config.readOnly===true),
  })

  const registry=new ExtensionRegistry({
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
  })

  const styles=config.injectStyles===false?null:acquireStyleUrls(CORE_STYLE_URLS,document)
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

  runtime=new DocumentRuntime({
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
    requestSplit:id=>keyboardRouter?.split(id),
    requestExit:id=>keyboardRouter?.exit(id),
    onCommit:event=>{
      interaction?.reconcile()
      notifier?.schedule()
      emitSafe(events,'transaction:committed',event)
      emitSafe(events,'document:changed',{
        origin:event.origin,
        action:event.action,
        changes:event.record?.changes??[],
      })
      emitSafe(events,'history:changed',{canUndo:runtime?.canUndo===true,canRedo:runtime?.canRedo===true})
    },
    projectorFactory:({activationResolver,contextFactory})=>{
      reconciler=new BlockReconciler({
        container:blocksElement,
        registry,
        contextFactory,
        activationResolver,
        inlineProjection,
        readOnly:config.readOnly===true,
      })
      return reconciler
    },
  })

  logicalSelection=new LogicalSelection({root,reconciler})
  interaction=new InteractionState({runtime,reconciler})
  view=new EditorViewModel({runtime,reconciler,interaction,selection:logicalSelection})
  const crossSelection=new SelectionControllerV2({root,runtime,reconciler,view})
  const nativeInput=new NativeInputController({root,runtime,reconciler})
  const inlineCommands=new InlineCommandController({runtime,registry,selection:logicalSelection})
  const triggers=new InlineTriggerController({
    root,
    registry,
    reconciler,
    selection:logicalSelection,
    commands:inlineCommands,
  })

  const clipboard=new ClipboardControllerV2({
    root,
    runtime,
    registry,
    reconciler,
    selection:logicalSelection,
    view,
    crossSelection,
  })

  toolbar=new BlockToolbarV2({
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
  })

  const drag=new DragControllerV2({
    runtime,
    view,
    handle:toolbar.dragHandle,
  })

  const inlineToolbar=new InlineToolbarV2({
    root,
    runtime,
    registry,
    reconciler,
    selection:logicalSelection,
    tools:config.inlineTools??[],
  })

  keyboardRouter=new KeyboardRouter({
    root,
    runtime,
    registry,
    reconciler,
    selection:logicalSelection,
    view,
    inlineToolbar,
    crossSelection,
  })

  const onFocusIn=event=>{
    const blockId=reconciler.resolveBlockTarget(event.target)
    if(blockId){
      interaction.setCurrent(blockId)
      toolbar?.showFor(blockId)
    }
  }
  root.addEventListener('focusin',onFocusIn)

  notifier=new ChangeNotifier(
    ()=>runtime.save(),
    config.onChange,
    Number.isFinite(config.changeDebounceMs)?Math.max(0,Number(config.changeDebounceMs)):250,
    document.defaultView??globalThis,
  )

  applyReadOnly(root,runtime.readOnly)

  const blocks=new EditorBlocksApiV2({runtime,view})
  let editor
  const destroy=()=>{
    if(destroyed)return
    destroyed=true
    root.removeEventListener('focusin',onFocusIn)
    triggers.destroy()
    clipboard.destroy()
    crossSelection.destroy()
    drag.destroy()
    inlineToolbar.destroy()
    toolbar?.destroy()
    keyboardRouter?.destroy()
    nativeInput.destroy()
    notifier.destroy()
    popup.destroy()
    runtime.destroy()
    registry.destroy()
    styles?.destroy()
    root.remove()
    lease.destroy()
    emitSafe(events,'editor:destroyed')
  }
  const setReadOnly=value=>{
    runtime.setReadOnly(value)
    popup.setReadOnly(runtime.readOnly)
    applyReadOnly(root,runtime.readOnly)
    toolbar?.setReadOnly(runtime.readOnly)
    inlineToolbar.setReadOnly(runtime.readOnly)
    emitSafe(events,'readOnly:changed',{readOnly:runtime.readOnly})
    emitSafe(events,'history:changed',{canUndo:runtime.canUndo,canRedo:runtime.canRedo})
  }

  editor=new EditorHandleV2({
    runtime,
    view,
    blocks,
    destroy,
    setReadOnly,
    inlineCommands,
    subscribe:(type,listener)=>events.on(type,listener),
  })

  if(config.autofocus&&!runtime.readOnly)view.focus()

  queueMicrotask(()=>{
    if(destroyed)return
    emitSafe(events,'editor:ready')
    invokeObserver(config.onReady,[editor],error=>console.warn('[Editor] onReady observer failed:',error))
  })

  return editor
}
