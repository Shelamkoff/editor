// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { acquireStyleUrls } from '../shared/styleRegistry.js'

function assertDenseArray(value,label,{allowEmpty=true}={}){
  if(!Array.isArray(value)||(!allowEmpty&&value.length===0)){
    throw new TypeError(`${label} must be a dense ${allowEmpty?'':'non-empty '}array`)
  }
  const result=[]
  for(let index=0;index<value.length;index++){
    if(!Object.hasOwn(value,index)){
      throw new TypeError(`${label} must be a dense ${allowEmpty?'':'non-empty '}array`)
    }
    result.push(value[index])
  }
  return result
}

function validateType(type,label){
  if(typeof type!=='string'||type.length===0)throw new TypeError(`${label} type must be a non-empty string`)
}

function bindMethod(source,key,label,{optional=false}={}){
  const value=source?.[key]
  if(value===undefined&&optional)return undefined
  if(typeof value!=='function')throw new TypeError(`${label} ${key} must be a function`)
  return value.bind(source)
}

function snapshotLabel(value,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} label must be an object`)
  const key=value.key
  const fallback=value.fallback
  if(typeof key!=='string'||!key||typeof fallback!=='string'){
    throw new TypeError(`${label} label requires string key and fallback`)
  }
  return Object.freeze({key,fallback})
}

function snapshotStyles(value,label){
  if(value===undefined)return undefined
  const styles=assertDenseArray(value,`${label} styles`)
  return Object.freeze(styles.map(style=>{
    if(typeof style!=='string')throw new TypeError(`${label} styles must contain strings`)
    return style
  }))
}

function ownSchemaResult(result,currentVersion,label){
  if(!result||typeof result!=='object'||Array.isArray(result)){
    throw new TypeError(`${label} schema result must be an object`)
  }
  if(result.dataVersion!==currentVersion){
    throw new TypeError(`${label} schema result must emit captured currentVersion`)
  }
  return {dataVersion:currentVersion,data:cloneEditorData(result.data)}
}

function snapshotSchema(source,label,{richText=false}={}){
  if(!source||typeof source!=='object'||Array.isArray(source)){
    throw new TypeError(`${label} must provide a current exact-version data schema`)
  }
  if(Object.hasOwn(source,'legacyVersion')||Object.hasOwn(source,'migrations')){
    throw new TypeError(`${label} schema contains removed compatibility options`)
  }

  const currentVersion=source.currentVersion
  if(!Number.isSafeInteger(currentVersion)||currentVersion<1){
    throw new TypeError(`${label} must provide a current exact-version data schema`)
  }
  const createDefault=bindMethod(source,'createDefault',`${label} schema`)
  const decode=bindMethod(source,'decode',`${label} schema`)
  const encode=bindMethod(source,'encode',`${label} schema`)
  const mapRichText=richText?bindMethod(source,'mapRichText',`${label} schema`,{optional:true}):undefined

  const schema={
    currentVersion,
    createDefault(){
      return cloneEditorData(createDefault())
    },
    decode(input){
      return ownSchemaResult(decode(input),currentVersion,label)
    },
    encode(data){
      return ownSchemaResult(encode(data),currentVersion,label)
    },
  }
  if(mapRichText){
    schema.mapRichText=(data,transform)=>cloneEditorData(mapRichText(data,transform))
  }

  const initial=schema.createDefault()
  const encoded=schema.encode(initial)
  const decoded=schema.decode({dataVersion:currentVersion,data:encoded.data})
  if(JSON.stringify(encoded.data)!==JSON.stringify(decoded.data)){
    throw new TypeError(`${label} schema default must round-trip canonically`)
  }
  return Object.freeze(schema)
}

function snapshotFormatting(value,label){
  if(value===undefined)return undefined
  if(value===true)return Object.freeze({inlineTools:true})
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} formatting must be an object`)
  const inlineTools=value.inlineTools
  if(inlineTools===true)return Object.freeze({inlineTools:true})
  const tools=assertDenseArray(inlineTools,`${label} formatting.inlineTools`).map(tool=>{
    if(typeof tool!=='string'||!tool)throw new TypeError(`${label} formatting inlineTools must contain strings`)
    return tool
  })
  return Object.freeze({inlineTools:Object.freeze(tools)})
}

function snapshotActions(value,label){
  if(value===undefined)return undefined
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} must be an object`)
  const kind=value.kind
  if(kind==='actions'){
    return Object.freeze({
      kind,
      actions:bindMethod(value,'actions',label),
      apply:bindMethod(value,'apply',label),
    })
  }
  if(kind==='panel'){
    return Object.freeze({kind,render:bindMethod(value,'render',label)})
  }
  throw new TypeError(`${label} kind must be actions or panel`)
}

function snapshotPaste(value,label){
  if(value===undefined)return undefined
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} paste must be an object`)
  return Object.freeze({
    accepts:bindMethod(value,'accepts',`${label} paste`),
    resolve:bindMethod(value,'resolve',`${label} paste`),
  })
}

function snapshotCapabilities(value,label){
  if(value===undefined)return undefined
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} capabilities must be an object`)
  const result={}

  const empty=value.empty
  if(empty!==undefined)result.empty=Object.freeze({isEmpty:bindMethod(empty,'isEmpty',`${label} empty capability`)})

  const formatting=value.formatting
  if(formatting!==undefined)result.formatting=snapshotFormatting(formatting,`${label} capability`)

  const merge=value.merge
  if(merge!==undefined)result.merge=Object.freeze({merge:bindMethod(merge,'merge',`${label} merge capability`)})

  const conversion=value.conversion
  if(conversion!==undefined){
    result.conversion=Object.freeze({
      export:bindMethod(conversion,'export',`${label} conversion capability`),
      canImport:bindMethod(conversion,'canImport',`${label} conversion capability`),
      import:bindMethod(conversion,'import',`${label} conversion capability`),
    })
  }

  const selectionSlice=value.selectionSlice
  if(selectionSlice!==undefined){
    result.selectionSlice=Object.freeze({slice:bindMethod(selectionSlice,'slice',`${label} selectionSlice capability`)})
  }

  const inlineControls=value.inlineControls
  if(inlineControls!==undefined)result.inlineControls=snapshotActions(inlineControls,`${label} inlineControls capability`)

  const settings=value.settings
  if(settings!==undefined)result.settings=snapshotActions(settings,`${label} settings capability`)

  const paste=value.paste
  if(paste!==undefined)result.paste=snapshotPaste(paste,label)

  const shortcuts=value.shortcuts
  if(shortcuts!==undefined){
    result.shortcuts=Object.freeze({handle:bindMethod(shortcuts,'handle',`${label} shortcuts capability`)})
  }
  return Object.freeze(result)
}

function snapshotToolbox(value,label){
  if(value===undefined)return undefined
  const items=assertDenseArray(value,`${label} toolbox`)
  return Object.freeze(items.map((source,index)=>{
    if(!source||typeof source!=='object'||Array.isArray(source))throw new TypeError(`${label} toolbox[${index}] must be an object`)
    const id=source.id
    const icon=source.icon
    if(typeof id!=='string'||!id||typeof icon!=='string')throw new TypeError(`${label} toolbox item is invalid`)
    const configure=bindMethod(source,'configure',`${label} toolbox item`,{optional:true})
    return Object.freeze({
      id,
      label:snapshotLabel(source.label,`${label} toolbox item`),
      icon,
      ...(configure?{configure}:{}),
    })
  }))
}

function snapshotBlockDefinition(source,index){
  if(!source||typeof source!=='object'||Array.isArray(source))throw new TypeError(`Block definition[${index}] must be an object`)
  const type=source.type
  validateType(type,'Block definition')
  const label=`Block definition "${type}"`
  const setup=bindMethod(source,'setup',label)
  const schema=snapshotSchema(source.schema,label,{richText:true})
  const definition={
    type,
    label:snapshotLabel(source.label,label),
    icon:typeof source.icon==='string'?source.icon:'',
    schema,
    setup,
  }
  const styles=snapshotStyles(source.styles,label)
  const toolbox=snapshotToolbox(source.toolbox,label)
  const capabilities=snapshotCapabilities(source.capabilities,label)
  if(styles)definition.styles=styles
  if(toolbox)definition.toolbox=toolbox
  if(capabilities)definition.capabilities=capabilities
  return Object.freeze(definition)
}

function snapshotInlinePaste(value,label){
  if(value===undefined)return undefined
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} paste must be an object`)
  const patterns=assertDenseArray(value.patterns,`${label} paste.patterns`).map(pattern=>{
    if(!(pattern instanceof RegExp))throw new TypeError(`${label} paste patterns must be RegExp values`)
    return new RegExp(pattern.source,pattern.flags)
  })
  return Object.freeze({
    patterns:Object.freeze(patterns),
    fromMatch:bindMethod(value,'fromMatch',`${label} paste`),
  })
}

function snapshotInlineDefinition(source,index){
  if(!source||typeof source!=='object'||Array.isArray(source))throw new TypeError(`Inline definition[${index}] must be an object`)
  const type=source.type
  validateType(type,'Inline definition')
  const label=`Inline definition "${type}"`
  const setup=bindMethod(source,'setup',label)
  const definition={
    type,
    label:snapshotLabel(source.label,label),
    icon:typeof source.icon==='string'?source.icon:'',
    schema:snapshotSchema(source.schema,label),
    setup,
  }
  const styles=snapshotStyles(source.styles,label)
  if(styles)definition.styles=styles

  const trigger=source.trigger
  if(trigger!==undefined){
    if(typeof trigger!=='string'||[...trigger].length!==1)throw new TypeError(`${label} trigger must be exactly one Unicode code point`)
    definition.trigger=trigger
  }

  const paste=snapshotInlinePaste(source.paste,label)
  if(paste)definition.paste=paste

  const editing=source.editing
  if(editing!==undefined)definition.editing=Object.freeze({handle:bindMethod(editing,'handle',`${label} editing`)})

  const insertion=source.insertion
  if(insertion!==undefined)definition.insertion=Object.freeze({createInitial:bindMethod(insertion,'createInitial',`${label} insertion`)})

  return Object.freeze(definition)
}

function snapshotBlockRuntime(runtime,label){
  const destroy=runtime&&typeof runtime==='object'?runtime.destroy:undefined
  if(!runtime||typeof runtime!=='object'||typeof runtime.create!=='function'||typeof destroy!=='function'){
    if(typeof destroy==='function'){
      try{destroy.call(runtime)}catch{}
    }
    throw new TypeError(`${label} returned an invalid runtime`)
  }
  return Object.freeze({
    create:runtime.create.bind(runtime),
    destroy:destroy.bind(runtime),
  })
}

function snapshotInlineRuntime(runtime,label){
  const destroy=runtime&&typeof runtime==='object'?runtime.destroy:undefined
  if(!runtime||typeof runtime!=='object'||typeof runtime.create!=='function'||typeof destroy!=='function'){
    if(typeof destroy==='function'){
      try{destroy.call(runtime)}catch{}
    }
    throw new TypeError(`${label} returned an invalid runtime`)
  }
  const result={
    create:runtime.create.bind(runtime),
    destroy:destroy.bind(runtime),
  }
  for(const key of ['onTriggerQuery','onTriggerKeydown','onTriggerCancel']){
    const method=runtime[key]
    if(method!==undefined){
      if(typeof method!=='function')throw new TypeError(`${label} runtime ${key} must be a function`)
      result[key]=method.bind(runtime)
    }
  }
  return Object.freeze(result)
}

export class ExtensionRegistry {
  #ownerDocument
  #abortController
  #blockDefinitions=new Map()
  #blockRuntimes=new Map()
  #inlineDefinitions=new Map()
  #inlineRuntimes=new Map()
  #inlineTriggers=new Map()
  #resources=[]
  #destroyed=false
  #defaultBlockType

  constructor(options){
    if(!options||typeof options!=='object')throw new TypeError('ExtensionRegistry options must be an object')
    const ownerDocument=options.ownerDocument
    if(!ownerDocument?.createElement)throw new TypeError('ExtensionRegistry requires an ownerDocument')

    const blockSources=assertDenseArray(options.blocks,'blocks',{allowEmpty:false})
    const inlineSources=assertDenseArray(options.inline??[],'inline')
    const blocks=blockSources.map(snapshotBlockDefinition)
    const inline=inlineSources.map(snapshotInlineDefinition)

    this.#ownerDocument=ownerDocument
    this.#abortController=new (ownerDocument.defaultView?.AbortController??AbortController)()
    const acquireStyles=options.acquireStyles!==false
    const translate=typeof options.translate==='function'?options.translate:(_key,fallback='')=>fallback

    for(const definition of blocks){
      if(this.#blockDefinitions.has(definition.type))throw new Error(`Duplicate block definition type: ${definition.type}`)
      this.#blockDefinitions.set(definition.type,definition)
    }

    const defaultBlock=options.defaultBlock??(this.#blockDefinitions.has('paragraph')?'paragraph':blocks[0].type)
    if(!this.#blockDefinitions.has(defaultBlock))throw new Error(`Default block type is not registered: ${defaultBlock}`)
    this.#defaultBlockType=defaultBlock

    for(const definition of inline){
      if(this.#inlineDefinitions.has(definition.type))throw new Error(`Duplicate inline definition type: ${definition.type}`)
      if(definition.trigger!==undefined){
        if(this.#inlineTriggers.has(definition.trigger))throw new Error(`Duplicate inline trigger: ${definition.trigger}`)
        this.#inlineTriggers.set(definition.trigger,definition)
      }
      this.#inlineDefinitions.set(definition.type,definition)
    }

    try{
      for(const definition of blocks){
        const styles=acquireStyles?[...(definition.styles??[])]:[]
        if(styles.length)this.#resources.push(acquireStyleUrls(styles,ownerDocument))
        const runtime=snapshotBlockRuntime(definition.setup({
          ownerDocument,
          signal:this.#abortController.signal,
          isDefaultBlock:definition.type===defaultBlock,
          editorPlaceholder:definition.type===defaultBlock?options.placeholder:undefined,
          t:(key,fallback='')=>translate(`plugin.${definition.type}.${key}`,fallback),
        }),`Block definition "${definition.type}"`)
        this.#blockRuntimes.set(definition.type,runtime)
      }

      for(const definition of inline){
        const styles=acquireStyles?[...(definition.styles??[])]:[]
        if(styles.length)this.#resources.push(acquireStyleUrls(styles,ownerDocument))
        const runtime=snapshotInlineRuntime(definition.setup({
          ownerDocument,
          signal:this.#abortController.signal,
          t:(key,fallback='')=>translate(`inlinePlugin.${definition.type}.${key}`,fallback),
          showPopup:typeof options.showPopup==='function'?options.showPopup:()=>{},
          hidePopup:typeof options.hidePopup==='function'?options.hidePopup:()=>{},
        }),`Inline definition "${definition.type}"`)
        this.#inlineRuntimes.set(definition.type,runtime)
      }
    }catch(error){
      this.destroy()
      throw error
    }
  }

  get defaultBlockType(){return this.#defaultBlockType}
  get blockTypes(){return [...this.#blockDefinitions.keys()]}
  get inlineTypes(){return [...this.#inlineDefinitions.keys()]}
  getBlockDefinition(type){return this.#blockDefinitions.get(type)}
  getBlockRuntime(type){return this.#blockRuntimes.get(type)}
  getInlineDefinition(type){return this.#inlineDefinitions.get(type)}
  getInlineRuntime(type){return this.#inlineRuntimes.get(type)}
  getInlineByTrigger(trigger){return this.#inlineTriggers.get(trigger)}
  hasBlock(type){return this.#blockDefinitions.has(type)}
  hasInline(type){return this.#inlineDefinitions.has(type)}

  destroy(){
    if(this.#destroyed)return
    this.#destroyed=true
    this.#abortController.abort()

    for(const runtime of [...this.#inlineRuntimes.values()].reverse()){
      try{runtime.destroy()}catch{}
    }
    this.#inlineRuntimes.clear()

    for(const runtime of [...this.#blockRuntimes.values()].reverse()){
      try{runtime.destroy()}catch{}
    }
    this.#blockRuntimes.clear()

    for(let index=this.#resources.length-1;index>=0;index--){
      try{this.#resources[index]?.destroy()}catch{}
    }
    this.#resources=[]
  }
}
