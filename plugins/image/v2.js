// @ts-check
import { setSanitizedHtml, setSafeUrlAttribute } from '../../plugin-kit/index.js'
import { imageDataSchema } from '../../shared/blockSchemas/image.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { isSupportedImageFile, triggerFileInput } from '../shared/fileInput.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'
import { ImageUploader } from './uploader.js'
import { CSS } from './css.js'
import { ICON } from './icons.js'

const editorStyles=new URL('./image.css',import.meta.url).href
const sourceEditorStyles=new URL('../shared/sourceEditor.css',import.meta.url).href

/** @typedef {{url:string,alt?:string}} ImageSourceResult */
/** @typedef {(file:File,context:{signal:AbortSignal})=>Promise<ImageSourceResult>} ImageUpload */
/** @typedef {(context:{signal:AbortSignal})=>Promise<ImageSourceResult|null>} ImageSourceHandler */

/**
 * @param {{uploadFile?:ImageUpload,actions?:Array<{icon?:string,label:string,handler:ImageSourceHandler}>,injectStyles?:boolean,css?:string}} [config]
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<any>}
 */
export function createImagePlugin(config={}){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Image configuration must be an object')
  const snapshot=Object.freeze({
    ...config,
    actions:Object.freeze([...(config.actions??[])]),
  })
  const styles=[]
  if(snapshot.injectStyles!==false)styles.push(editorStyles,sourceEditorStyles)
  if(snapshot.css)styles.push(snapshot.css)

  const capabilities=Object.freeze({
    empty:Object.freeze({isEmpty:data=>!data.file.url}),
    conversion:Object.freeze({
      export:data=>({kind:'rich-text',data:{text:data.caption}}),
      canImport:payload=>payload?.kind==='rich-text'&&typeof payload.data?.text==='string',
      import(payload){
        if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string')throw new TypeError('Image can only import rich-text payloads')
        return {...imageDataSchema.createDefault(),caption:payload.data.text}
      },
    }),
    settings:Object.freeze({
      kind:/** @type {'actions'} */('actions'),
      actions(data){
        return [
          Object.freeze({id:'border',label:Object.freeze({key:'withBorder',fallback:'Border'}),active:data.withBorder}),
          Object.freeze({id:'expanded',label:Object.freeze({key:'expanded',fallback:'Expanded'}),active:data.expanded}),
          Object.freeze({id:'background',label:Object.freeze({key:'withBackground',fallback:'Background'}),active:data.withBackground}),
        ]
      },
      apply(data,actionId){
        if(actionId==='border')return {...data,withBorder:!data.withBorder}
        if(actionId==='expanded')return {...data,expanded:!data.expanded}
        if(actionId==='background')return {...data,withBackground:!data.withBackground}
        throw new RangeError('Unknown image setting: '+actionId)
      },
    }),
    paste:Object.freeze({
      accepts(input){
        if(input.kind==='file')return isSupportedImageFile(input.file)
        return input.kind==='text'&&/^https?:\/\/\S+\.(?:gif|jpe?g|png|svg|webp)(?:\?\S*)?$/i.test(input.text)
      },
      async resolve(input,context){
        if(input.kind==='text'){
          const url=sanitizeMediaUrl(input.text)
          return url?{kind:/** @type {'block'} */('block'),data:{...imageDataSchema.createDefault(),file:{url}}}:null
        }
        if(input.kind!=='file'||!isSupportedImageFile(input.file))return null
        const uploader=new ImageUploader(snapshot)
        const box={value:/** @type {ImageSourceResult|null} */(null)}
        await uploader.handle(input.file,value=>{box.value=value},context.signal,context.ownerDocument)
        const result=box.value
        if(context.signal.aborted||!result||!result.url)return null
        return {
          kind:/** @type {'block'} */('block'),
          data:{
            ...imageDataSchema.createDefault(),
            file:{url:result.url},
            caption:typeof result.alt==='string'?result.alt:'',
          },
        }
      },
    }),
  })

  return Object.freeze({
    type:'image',
    label:Object.freeze({key:'title',fallback:'Image'}),
    icon:ICON,
    styles:Object.freeze(styles),
    schema:imageDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      const uploader=new ImageUploader(snapshot)
      return {
        create(initial,context){
          if(destroyed)throw new Error('Image runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className=CSS.wrapper
          wrapper.contentEditable='false'
          wrapper.tabIndex=-1

          const image=document.createElement('img')
          image.className=CSS.image
          const caption=document.createElement('div')
          caption.className=CSS.caption
          caption.dataset.placeholder=runtimeContext.t('caption','Caption')

          const empty=document.createElement('button')
          empty.type='button'
          empty.className=CSS.select
          empty.textContent=runtimeContext.t('dropzoneUpload','Upload image')

          const controls=document.createElement('div')
          controls.className=CSS.actions
          const replace=document.createElement('button')
          replace.type='button'
          replace.textContent=runtimeContext.t('replace','Replace')
          const urlButton=document.createElement('button')
          urlButton.type='button'
          urlButton.textContent=runtimeContext.t('dropzoneUrl','Insert by URL')
          const remove=document.createElement('button')
          remove.type='button'
          remove.textContent=runtimeContext.t('delete','Delete')
          controls.append(replace,urlButton,remove)

          const container=document.createElement('div')
          container.className=CSS.imageContainer
          container.append(image,caption)
          wrapper.append(empty,container,controls)

          let data={
            ...initial,
            file:{...initial.file},
            styles:{...initial.styles},
          }
          let readOnly=context.isReadOnly()
          let dead=false
          let requestGeneration=0
          let taskController=null

          const applyStyles=()=>{
            wrapper.classList.toggle(CSS.withBorder,data.withBorder)
            wrapper.classList.toggle(CSS.expanded,data.expanded)
            wrapper.classList.toggle(CSS.withBackground,data.withBackground)
            for(const [key,value] of Object.entries(data.styles)){
              if(key in image.style)image.style[key]=value
            }
          }
          const project=next=>{
            data={...next,file:{...next.file},styles:{...next.styles}}
            const hasImage=!!data.file.url
            wrapper.classList.toggle(CSS.filled,hasImage)
            empty.hidden=hasImage||readOnly
            container.hidden=!hasImage
            controls.hidden=readOnly
            if(hasImage)setSafeUrlAttribute(image,'src',data.file.url,'media')
            else image.removeAttribute('src')
            if(caption.innerHTML!==data.caption){
              if(data.caption)setSanitizedHtml(caption,data.caption)
              else caption.textContent=''
            }
            caption.contentEditable=!readOnly&&hasImage?'true':'false'
            image.alt=caption.textContent?.trim()??''
            applyStyles()
          }
          const updateData=next=>{
            context.updateData(()=>next)
          }
          const beginTask=()=>{
            taskController?.abort()
            const Ctor=document.defaultView?.AbortController??AbortController
            taskController=new Ctor()
            const generation=++requestGeneration
            const abort=()=>taskController?.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:taskController.signal})
            return {controller:taskController,generation}
          }
          const finishSource=(task,result)=>{
            if(dead||readOnly||task.controller.signal.aborted||task.generation!==requestGeneration)return
            const url=sanitizeMediaUrl(result?.url??'')
            if(!url)return
            updateData({
              ...data,
              file:{url},
              caption:data.caption||(typeof result?.alt==='string'?result.alt:''),
            })
          }
          const uploadFile=async file=>{
            if(readOnly||!isSupportedImageFile(file))return
            const task=beginTask()
            wrapper.classList.add(CSS.loading)
            try{
              await uploader.handle(file,result=>finishSource(task,result),task.controller.signal,document)
            }finally{
              if(task.generation===requestGeneration)wrapper.classList.remove(CSS.loading)
            }
          }
          const chooseFile=()=>{
            if(readOnly)return
            triggerFileInput({
              ownerDocument:document,
              accept:'image/*',
              signal:context.signal,
              onFiles:files=>{if(files[0])void uploadFile(files[0])},
            })
          }
          const openUrl=()=>{
            if(readOnly)return
            openSourceEditor({
              wrapper,
              signal:context.signal,
              kind:'url',
              title:runtimeContext.t('urlEditorTitle','Insert image by URL'),
              label:runtimeContext.t('urlEditorLabel','Image URL'),
              placeholder:'https://',
              submitText:runtimeContext.t('insert','Insert'),
              cancelText:runtimeContext.t('cancel','Cancel'),
              invalidText:runtimeContext.t('invalidUrl','Invalid image URL'),
              normalize:sanitizeMediaUrl,
              onSubmit:url=>updateData({...data,file:{url}}),
            })
          }

          empty.addEventListener('click',chooseFile,{signal:context.signal})
          replace.addEventListener('click',chooseFile,{signal:context.signal})
          urlButton.addEventListener('click',openUrl,{signal:context.signal})
          remove.addEventListener('click',()=>{if(!readOnly)updateData(imageDataSchema.createDefault())},{signal:context.signal})
          caption.addEventListener('input',()=>{image.alt=caption.textContent?.trim()??''},{signal:context.signal})
          preloadSourceEditor(wrapper,context.signal,['url'])
          project(data)

          return {
            element:wrapper,
            read:()=>({...data,file:{...data.file},styles:{...data.styles},caption:caption.innerHTML.trim()}),
            update(next){if(!dead)project(next)},
            editableFields:()=>data.file.url?Object.freeze([Object.freeze({key:'caption',element:caption,mode:/** @type {'rich-text'} */('rich-text')})]):Object.freeze([]),
            setReadOnly(value){readOnly=value;project(data)},
            focus(){if(!dead&&!readOnly)(data.file.url?caption:empty).focus()},
            destroy(){
              dead=true
              taskController?.abort()
            },
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
