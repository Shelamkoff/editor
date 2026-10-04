// @ts-check
import { setSanitizedHtml, setSafeUrlAttribute } from '../../plugin-kit/index.js'
import { insertTrustedHtml, setTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { imageDataSchema } from '../../shared/blockSchemas/image.js'
import { retainControlFocus } from '../shared/retainControlFocus.js'
import { acceptsTextPayload, richTextFromPayload } from '../shared/textConversion.js'
import { createTextSelectionSlice } from '../shared/textSelectionSlice.js'
import { createTextClipboardSlice } from '../shared/textClipboardSlice.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { isSupportedImageFile, triggerFileInput } from '../shared/fileInput.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'
import { ImageUploader } from './uploader.js'
import { CSS } from './css.js'
import { ICON, ICON_SELECT, ICON_SETTINGS, ICON_REPLACE, ICON_TRASH, ICON_UPLOAD, ICON_URL, ICON_BACK, ICON_CHEVRON_RIGHT } from './icons.js'
import { createMediaDropzone } from '../shared/mediaDropzone.js'
import { createPluginLayer } from '../shared/layer.js'
import { positionPluginPanel } from '../shared/positionPluginPanel.js'

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
      option.textContent=context.t(imageLabel('value.'+(item||'none'),item||'None'))
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
    element.className='oe-image__switch'+(checked?' oe-image__switch--active':'')
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
      row(context.t(imageLabel('expand','Expanded')),checkbox(data.expanded===true,value=>commit(current=>({...current,expanded:value})))),
      row(context.t(imageLabel('background','Background')),checkbox(data.withBackground===true,value=>commit(current=>({...current,withBackground:value})))),
      row(context.t(imageLabel('border','Border')),checkbox(data.withBorder===true,value=>commit(current=>({...current,withBorder:value})))),
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
      row(context.t(imageLabel('fit','Fit')),select(styles.objectFit??'', ['', 'none','cover','contain','fill','scale-down'],value=>updateStyle('objectFit',value))),
      row(context.t(imageLabel('position','Position')),input(styles.objectPosition??'',value=>updateStyle('objectPosition',value))),
      row(context.t(imageLabel('color','Background color')),input(styles.backgroundColor||'#000000',value=>updateStyle('backgroundColor',value),{type:'color'})),
      row(context.t(imageLabel('border','Border style')),select(styles.borderStyle??'', ['', 'none','solid','dashed'],value=>updateStyle('borderStyle',value))),
      row(context.t(imageLabel('color','Border color')),input(styles.borderColor||'#000000',value=>updateStyle('borderColor',value),{type:'color'})),
      row(context.t(imageLabel('width','Border width')),input(styles.borderWidth??'',value=>updateStyle('borderWidth',value))),
      row(context.t(imageLabel('radius','Border radius')),input(styles.borderRadius??'',value=>updateStyle('borderRadius',value))),
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
    selectionSlice:createTextSelectionSlice(imageDataSchema),
    clipboard:createTextClipboardSlice(imageDataSchema),
    empty:Object.freeze({isEmpty:data=>!data.file.url}),
    conversion:Object.freeze({
      export:data=>({kind:'rich-text',data:{text:data.caption}}),
      canImport:acceptsTextPayload,
      import(payload){
        return {...imageDataSchema.createDefault(),caption:richTextFromPayload(payload)}
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

          const empty=createMediaDropzone({ownerDocument:document,prefix:'oe-image',icon:ICON_SELECT,
            uploadText:runtimeContext.t('dropzoneUpload','Upload'),afterText:runtimeContext.t('dropzoneText','an image from your device or drag and drop it here'),
            urlPrefix:runtimeContext.t('dropzoneUrlPrefix','or'),emptyText:runtimeContext.t('emptyReadonly','No image'),readOnly:false,signal:context.signal,
            onUpload:()=>chooseFile(),inlineActions:[{label:runtimeContext.t('dropzoneUrl','Insert by URL'),onSelect:()=>openUrl()}],
            actions:snapshot.actions.map(action=>({...action,onSelect:()=>void runCustomAction(action)})),
          })
          const emptyReadonly=document.createElement('div')
          emptyReadonly.className=CSS.select
          emptyReadonly.textContent=runtimeContext.t('emptyReadonly','No image')

          const controls=document.createElement('div')
          controls.className=CSS.actions
          const mainView=document.createElement('div')
          mainView.className=CSS.actionsView
          const sourceView=document.createElement('div')
          sourceView.className=CSS.actionsView
          sourceView.hidden=true
          const action=(label,icon)=>{
            const button=document.createElement('button')
            button.type='button';button.className=CSS.actionBtn
            setTrustedHtml(button,icon);button.append(document.createTextNode(label))
            button.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
            return button
          }
          const dropdown=document.createElement('div')
          dropdown.className=CSS.dropdown
          const settings=action(runtimeContext.t('settings','Settings'),ICON_SETTINGS)
          settings.setAttribute('aria-haspopup','true');settings.setAttribute('aria-expanded','false')
          const panel=document.createElement('div')
          panel.className=CSS.dropdownPanel
          panel.setAttribute('role','group');panel.setAttribute('aria-label',runtimeContext.t('settings','Settings'))
          dropdown.append(settings,panel)
          const layer=createPluginLayer(wrapper,context.signal)
          const closeSettings=()=>{dropdown.classList.remove(CSS.dropdownOpen);settings.setAttribute('aria-expanded','false');layer.close()}
          settings.addEventListener('click',()=>{
            if(settings.getAttribute('aria-expanded')==='true'){closeSettings();return}
            layer.open();dropdown.classList.add(CSS.dropdownOpen);settings.setAttribute('aria-expanded','true')
            positionPluginPanel(panel,dropdown)
          },{signal:context.signal})
          document.addEventListener('click',event=>{if(!dropdown.contains(event.target))closeSettings()},{signal:context.signal})
          dropdown.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSettings();settings.focus()}},{signal:context.signal})
          const replace=document.createElement('button')
          replace.type='button'
          replace.className=CSS.actionBtn
          setTrustedHtml(replace,ICON_REPLACE)
          replace.append(document.createTextNode(runtimeContext.t('replace','Replace')))
          insertTrustedHtml(replace,'beforeend',ICON_CHEVRON_RIGHT)
          const back=action(runtimeContext.t('back','Back'),ICON_BACK)
          const upload=action(runtimeContext.t('upload','Upload'),ICON_UPLOAD)
          const urlButton=action(runtimeContext.t('url','URL'),ICON_URL)
          const remove=document.createElement('button')
          remove.type='button'
          remove.className=CSS.actionBtn+' '+CSS.actionBtnDanger
          remove.setAttribute('aria-label',runtimeContext.t('delete','Delete'))
          setTrustedHtml(remove,ICON_TRASH)
          mainView.append(dropdown,replace,remove)
          sourceView.append(back,upload)
          controls.append(mainView,sourceView)

          const customActionButtons=[]
          for(const action of snapshot.actions){
            const filledButton=document.createElement('button')
            filledButton.type='button'
            filledButton.className=CSS.actionBtn
            if(action.icon)insertTrustedHtml(filledButton,'afterbegin',action.icon)
            filledButton.append(document.createTextNode(action.label))
            sourceView.appendChild(filledButton)
            customActionButtons.push({action,filledButton})
          }
          sourceView.append(urlButton)

          const container=document.createElement('div')
          container.className=CSS.imageContainer
          container.append(image,caption)
          wrapper.append(empty,emptyReadonly,container,controls)

          let data={
            ...initial,
            file:{...initial.file},
            styles:{...initial.styles},
          }
          let readOnly=context.isReadOnly()
          let dead=false
          let requestGeneration=0
          let currentTask=null

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
            emptyReadonly.hidden=hasImage||!readOnly
            container.hidden=!hasImage
            controls.hidden=readOnly||!hasImage
            controls.inert=readOnly
            if(readOnly||!hasImage){closeSettings();mainView.hidden=false;sourceView.hidden=true}
            panel.replaceChildren(renderImageSettings({ownerDocument:document,getData:()=>data,
              t:label=>runtimeContext.t(label.key,label.fallback),
              updateData:producer=>{context.updateData(producer);wrapper.focus({preventScroll:true})},
            }))
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
            retainControlFocus(wrapper,()=>context.updateData(()=>next))
          }
          const beginTask=()=>{
            currentTask?.cancel()
            const task=context.beginTask()
            const generation=++requestGeneration
            currentTask=task
            return {task,generation}
          }
          const finishSource=(request,result)=>{
            if(dead||readOnly||request.task.signal.aborted||request.generation!==requestGeneration)return false
            const url=sanitizeMediaUrl(result?.url??'')
            if(!url)return false
            return retainControlFocus(wrapper,()=>request.task.commit(current=>({
              ...current,
              file:{url},
              caption:current.caption||(typeof result?.alt==='string'?result.alt:''),
            })))
          }
          const runCustomAction=async action=>{
            if(readOnly||dead)return
            const task=beginTask()
            wrapper.classList.add(CSS.loading)
            try{
              const result=await action.handler({signal:task.task.signal})
              finishSource(task,result)
            }catch(error){
              if(!task.task.signal.aborted)console.warn('[Image] Source action failed',error)
            }finally{
              task.task.cancel()
              if(currentTask===task.task)currentTask=null
              if(task.generation===requestGeneration)wrapper.classList.remove(CSS.loading)
            }
          }
          const uploadFile=async file=>{
            if(readOnly||!isSupportedImageFile(file))return
            const task=beginTask()
            wrapper.classList.add(CSS.loading)
            try{
              await uploader.handle(file,result=>finishSource(task,result),task.task.signal,document)
            }finally{
              task.task.cancel()
              if(currentTask===task.task)currentTask=null
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
                submitText:runtimeContext.t('sourceSubmit','Insert'),
                cancelText:runtimeContext.t('sourceCancel','Cancel'),
              invalidText:runtimeContext.t('invalidUrl','Invalid image URL'),
              normalize:sanitizeMediaUrl,
              onSubmit:url=>updateData({...data,file:{url}}),
            })
          }

          const restoreSource=()=>{sourceView.hidden=true;mainView.hidden=false}
          replace.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
          replace.addEventListener('click',()=>{closeSettings();mainView.hidden=true;sourceView.hidden=false},{signal:context.signal})
          back.addEventListener('click',restoreSource,{signal:context.signal})
          upload.addEventListener('click',()=>{chooseFile();restoreSource()},{signal:context.signal})
          urlButton.addEventListener('click',()=>{openUrl();restoreSource()},{signal:context.signal})
          remove.addEventListener('click',()=>{
            if(readOnly)return
            currentTask?.cancel()
            currentTask=null
            wrapper.classList.remove(CSS.loading)
            updateData(imageDataSchema.createDefault())
          },{signal:context.signal})
          for(const {action,filledButton} of customActionButtons){
            filledButton.addEventListener('click',()=>{void runCustomAction(action);restoreSource()},{signal:context.signal})
          }
          caption.addEventListener('input',()=>{image.alt=caption.textContent?.trim()??''},{signal:context.signal})
          wrapper.addEventListener('dragover',event=>{
            if(readOnly||!event.dataTransfer?.types.includes('Files'))return
            event.preventDefault()
            event.dataTransfer.dropEffect='copy'
          },{signal:context.signal})
          wrapper.addEventListener('drop',event=>{
            const file=[...(event.dataTransfer?.files??[])].find(isSupportedImageFile)
            if(readOnly||!file)return
            event.preventDefault();event.stopPropagation()
            void uploadFile(file)
          },{signal:context.signal})
          preloadSourceEditor(wrapper,context.signal,['url'])
          project(data)

          return {
            element:wrapper,
            read:()=>({...data,file:{...data.file},styles:{...data.styles},caption:caption.innerHTML.trim()}),
            update(next){if(!dead)project(next)},
            editableFields:()=>data.file.url?Object.freeze([Object.freeze({key:'caption',element:caption,mode:/** @type {'rich-text'} */('rich-text')})]):Object.freeze([]),
            setReadOnly(value){readOnly=value;project(data)},
            focus(){if(!dead&&!readOnly)(data.file.url?caption:empty.querySelector('button'))?.focus()},
            destroy(){
              dead=true
              currentTask?.cancel()
              currentTask=null
            },
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
