// @ts-check
import { setSanitizedHtml, setSafeUrlAttribute } from '../../plugin-kit/index.js'
import { insertTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
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


function imageLabel(key,fallback){return Object.freeze({key,fallback})}

function renderImageSettings(context){
  const document=context.ownerDocument
  const root=document.createElement('div')
  root.className='oe-image__style-form'
  const commit=producer=>{context.updateData(producer);render()}
  const row=(label,control)=>{
    const wrapper=document.createElement('label')
    wrapper.className='oe-image__style-label'
    const text=document.createElement('span')
    text.textContent=label
    wrapper.append(text,control)
    return wrapper
  }
  const input=(value,onChange,{type='text',placeholder=''}={})=>{
    const element=document.createElement('input')
    element.type=type
    element.className='oe-image__style-input'
    element.value=value??''
    if(placeholder)element.placeholder=placeholder
    element.addEventListener('change',()=>onChange(element.value,element))
    return element
  }
  const select=(value,values,onChange)=>{
    const element=document.createElement('select')
    element.className='oe-image__style-input'
    for(const item of values){
      const option=document.createElement('option')
      option.value=item
      option.textContent=item||context.t(imageLabel('value.none','None'))
      option.selected=item===value
      element.appendChild(option)
    }
    element.addEventListener('change',()=>onChange(element.value))
    return element
  }
  const checkbox=(checked,onChange)=>{
    const element=document.createElement('input')
    element.type='checkbox'
    element.checked=checked
    element.addEventListener('change',()=>onChange(element.checked))
    return element
  }
  const updateStyle=(key,value)=>commit(current=>{
    const styles={...current.styles}
    if(String(value).trim())styles[key]=String(value).trim()
    else delete styles[key]
    return {...current,styles}
  })

  const render=()=>{
    const data=context.getData()
    const styles=data.styles??{}
    root.replaceChildren()

    const toggles=document.createElement('div')
    toggles.className='oe-image__switch-row'
    toggles.append(
      row(context.t(imageLabel('expanded','Expanded')),checkbox(data.expanded===true,value=>commit(current=>({...current,expanded:value})))),
      row(context.t(imageLabel('withBackground','Background')),checkbox(data.withBackground===true,value=>commit(current=>({...current,withBackground:value})))),
      row(context.t(imageLabel('withBorder','Border')),checkbox(data.withBorder===true,value=>commit(current=>({...current,withBorder:value})))),
    )
    root.appendChild(toggles)

    const dimensions=document.createElement('div')
    dimensions.className='oe-image__style-group'
    const dimensionsTitle=document.createElement('div')
    dimensionsTitle.className='oe-image__style-group-title'
    dimensionsTitle.textContent=context.t(imageLabel('dimensions','Dimensions'))
    dimensions.append(
      dimensionsTitle,
      row(context.t(imageLabel('width','Width')),input(styles.width??'',value=>updateStyle('width',value))),
      row(context.t(imageLabel('height','Height')),input(styles.height??'',value=>updateStyle('height',value))),
      row(context.t(imageLabel('minWidth','Min width')),input(styles.minWidth??'',value=>updateStyle('minWidth',value))),
      row(context.t(imageLabel('minHeight','Min height')),input(styles.minHeight??'',value=>updateStyle('minHeight',value))),
      row(context.t(imageLabel('maxWidth','Max width')),input(styles.maxWidth??'',value=>updateStyle('maxWidth',value))),
      row(context.t(imageLabel('maxHeight','Max height')),input(styles.maxHeight??'',value=>updateStyle('maxHeight',value))),
    )
    root.appendChild(dimensions)

    const display=document.createElement('div')
    display.className='oe-image__style-group'
    const displayTitle=document.createElement('div')
    displayTitle.className='oe-image__style-group-title'
    displayTitle.textContent=context.t(imageLabel('display','Display'))
    display.append(
      displayTitle,
      row(context.t(imageLabel('objectFit','Fit')),select(styles.objectFit??'', ['', 'none','cover','contain','fill','scale-down'],value=>updateStyle('objectFit',value))),
      row(context.t(imageLabel('objectPosition','Position')),input(styles.objectPosition??'',value=>updateStyle('objectPosition',value))),
      row(context.t(imageLabel('backgroundColor','Background color')),input(styles.backgroundColor||'#000000',value=>updateStyle('backgroundColor',value),{type:'color'})),
      row(context.t(imageLabel('borderStyle','Border style')),select(styles.borderStyle??'', ['', 'none','solid','dashed'],value=>updateStyle('borderStyle',value))),
      row(context.t(imageLabel('borderColor','Border color')),input(styles.borderColor||'#000000',value=>updateStyle('borderColor',value),{type:'color'})),
      row(context.t(imageLabel('borderWidth','Border width')),input(styles.borderWidth??'',value=>updateStyle('borderWidth',value))),
      row(context.t(imageLabel('borderRadius','Border radius')),input(styles.borderRadius??'',value=>updateStyle('borderRadius',value))),
    )
    root.appendChild(display)
  }

  render()
  return root
}

/**
 * Create an immutable Image block definition with optional upload/source actions and stylesheet configuration.
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
      kind:/** @type {'panel'} */('panel'),
      render:renderImageSettings,
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

          const emptyActions=document.createElement('div')
          emptyActions.className=CSS.selectActions
          const emptyUrlButton=document.createElement('button')
          emptyUrlButton.type='button'
          emptyUrlButton.className=CSS.selectAction
          emptyUrlButton.textContent=runtimeContext.t('dropzoneUrl','Insert by URL')
          emptyActions.appendChild(emptyUrlButton)

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
          controls.append(replace,urlButton)

          const customActionButtons=[]
          for(const action of snapshot.actions){
            const emptyButton=document.createElement('button')
            emptyButton.type='button'
            emptyButton.className=CSS.selectAction
            if(action.icon)insertTrustedHtml(emptyButton,'afterbegin',action.icon)
            emptyButton.append(document.createTextNode(action.label))
            emptyActions.appendChild(emptyButton)

            const filledButton=document.createElement('button')
            filledButton.type='button'
            filledButton.className=CSS.actionBtn
            if(action.icon)insertTrustedHtml(filledButton,'afterbegin',action.icon)
            filledButton.append(document.createTextNode(action.label))
            controls.appendChild(filledButton)
            customActionButtons.push({action,emptyButton,filledButton})
          }
          controls.append(remove)

          const container=document.createElement('div')
          container.className=CSS.imageContainer
          container.append(image,caption)
          wrapper.append(empty,emptyActions,container,controls)

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
            image.style.cssText=''
            container.style.cssText=''
            const styles=data.styles??{}
            for(const key of ['objectFit','objectPosition','height','maxHeight','minHeight']){
              if(styles[key])image.style[key]=styles[key]
            }
            if(!data.expanded){
              for(const key of ['width','maxWidth','minWidth'])if(styles[key])image.style[key]=styles[key]
            }
            if(styles.borderStyle&&styles.borderStyle!=='none'){
              image.style.borderStyle=styles.borderStyle
              image.style.borderWidth=styles.borderWidth||'1px'
              image.style.borderColor=styles.borderColor||'#2e2e35'
            }
            if(styles.borderRadius)image.style.borderRadius=styles.borderRadius
            if(data.withBackground&&styles.backgroundColor)container.style.backgroundColor=styles.backgroundColor
          }
          const project=next=>{
            data={...next,file:{...next.file},styles:{...next.styles}}
            const hasImage=!!data.file.url
            wrapper.classList.toggle(CSS.filled,hasImage)
            empty.hidden=hasImage||readOnly
            emptyActions.hidden=hasImage||readOnly
            container.hidden=!hasImage
            controls.hidden=readOnly||!hasImage
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
            const controller=new Ctor()
            taskController=controller
            const generation=++requestGeneration
            const abort=()=>controller.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:controller.signal})
            return {controller,generation}
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
          const runCustomAction=async action=>{
            if(readOnly||dead)return
            const task=beginTask()
            wrapper.classList.add(CSS.loading)
            try{
              const result=await action.handler({signal:task.controller.signal})
              finishSource(task,result)
            }catch(error){
              if(!task.controller.signal.aborted)console.warn('[Image] Source action failed',error)
            }finally{
              if(task.generation===requestGeneration)wrapper.classList.remove(CSS.loading)
            }
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
          emptyUrlButton.addEventListener('click',openUrl,{signal:context.signal})
          urlButton.addEventListener('click',openUrl,{signal:context.signal})
          remove.addEventListener('click',()=>{
            if(readOnly)return
            taskController?.abort()
            wrapper.classList.remove(CSS.loading)
            updateData(imageDataSchema.createDefault())
          },{signal:context.signal})
          for(const {action,emptyButton,filledButton} of customActionButtons){
            emptyButton.addEventListener('click',()=>void runCustomAction(action),{signal:context.signal})
            filledButton.addEventListener('click',()=>void runCustomAction(action),{signal:context.signal})
          }
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
