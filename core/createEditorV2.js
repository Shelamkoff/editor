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
import { LogicalSelection } from './LogicalSelection.js'
import { InteractionState } from './InteractionState.js'
import { EditorViewModel } from './EditorViewModel.js'
import { InlineCommandController } from './InlineCommandController.js'
import { InlineTriggerController } from './InlineTriggerController.js'
import { EditorBlocksApiV2, EditorHandleV2 } from './PublicEditorApiV2.js'
import { ChangeNotifier } from './ChangeNotifier.js'
import { BUILT_IN_DOCUMENT_MIGRATIONS } from './documentMigrationsV2.js'

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
 *   data?: unknown,
 *   defaultBlock?: string,
 *   placeholder?: string,
 *   readOnly?: boolean,
 *   injectStyles?: boolean,
 *   theme?: 'light'|'dark',
 *   minHeight?: number,
 *   locale?: Record<string, any>,
 *   validationMode?: 'preserve'|'strict',
 *   documentVersionPolicy?: 'preserve'|'strict',
 *   onReady?: (editor:any)=>void|Promise<void>,
 *   onChange?: (document:any)=>void|Promise<void>,
 *   onValidationError?: (issue:any)=>void,
 *   changeDebounceMs?: number,
 * }} config
 */
export function createEditorV2(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('createEditor() requires a configuration object')
  const holder=config.holder
  const HTMLElementCtor=holder?.ownerDocument?.defaultView?.HTMLElement??globalThis.HTMLElement
  if(!HTMLElementCtor||!(holder instanceof HTMLElementCtor))throw new TypeError('createEditor() requires an HTMLElement holder')
  if(!Array.isArray(config.plugins)||config.plugins.length===0)throw new TypeError('createEditor() requires a non-empty plugins array')

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

  let pendingSplit=null
  let pendingExit=null

  runtime=new DocumentRuntime({
    registry,
    data:config.data,
    ownerDocument:document,
    validationMode:config.validationMode,
    documentVersionPolicy:config.documentVersionPolicy,
    migrations:BUILT_IN_DOCUMENT_MIGRATIONS,
    readOnly:config.readOnly===true,
    createId:prefix=>prefix+'-'+uid(),
    selection:selectionPort,
    onValidationError:config.onValidationError,
    requestSplit:id=>pendingSplit?.(id),
    requestExit:id=>pendingExit?.(id),
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
  const nativeInput=new NativeInputController({root,runtime,reconciler})
  const inlineCommands=new InlineCommandController({runtime,registry,selection:logicalSelection})
  const triggers=new InlineTriggerController({
    root,
    registry,
    reconciler,
    selection:logicalSelection,
    commands:inlineCommands,
  })

  // Minimal structural commands for block-local v2 contexts. Full keyboard
  // routing is layered on top of the same ports; no legacy manager participates.
  pendingExit=id=>{
    const record=runtime.get(id)
    if(!record||runtime.readOnly)return
    if(record.type!==registry.defaultBlockType){
      runtime.convert(id,{type:registry.defaultBlockType})
      interaction.setCurrent(id)
      queueMicrotask(()=>view.focus(id,{offset:'start'}))
      return
    }
    const index=view.indexOf(id)
    const next=view.insert(registry.defaultBlockType,undefined,index+1)
    queueMicrotask(()=>view.focus(next,{offset:'start'}))
  }
  pendingSplit=id=>{
    const record=runtime.get(id)
    if(!record||runtime.readOnly)return
    const bookmark=logicalSelection.capture()
    const point=bookmark?.focus
    const definition=registry.getBlockDefinition(record.type)
    if(
      !point
      ||point.blockId!==id
      ||!definition?.schema?.mapRichText
    )return
    // Generic rich-text blocks that need custom split semantics expose them in
    // their own instance/key handling. Core fallback inserts the default block.
    const index=view.indexOf(id)
    const next=view.insert(registry.defaultBlockType,undefined,index+1)
    queueMicrotask(()=>view.focus(next,{offset:'start'}))
  }

  const onFocusIn=event=>{
    const blockId=reconciler.resolveBlockTarget(event.target)
    if(blockId)interaction.setCurrent(blockId)
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

  queueMicrotask(()=>{
    if(destroyed)return
    emitSafe(events,'editor:ready')
    invokeObserver(config.onReady,[editor],error=>console.warn('[Editor] onReady observer failed:',error))
  })

  return editor
}
