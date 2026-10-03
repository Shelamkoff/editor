// @ts-check
import { setSafeUrlAttribute } from '../../plugin-kit/index.js'
import { insertTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { galleryDataSchema } from '../../shared/blockSchemas/gallery.js'
import { GALLERY_LAYOUTS } from '../../shared/blockOptions.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { isSupportedImageFile, triggerFileInput } from '../shared/fileInput.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'
import { GalleryUploader } from './uploader.js'
import { CSS } from './css.js'
import { ICON } from './icons.js'

const editorStyles=new URL('./gallery.css',import.meta.url).href
const sourceEditorStyles=new URL('../shared/sourceEditor.css',import.meta.url).href

/**
 * @typedef {(file:File,context:{signal:AbortSignal})=>Promise<{url:string,alt?:string}>} UploadFn
 * @typedef {{label:string,icon?:string,handler:(context:{signal:AbortSignal})=>Promise<Array<{url:string,alt?:string}>|null>}} SourceAction
 */


function galleryLabel(key,fallback){return Object.freeze({key,fallback})}

function renderGallerySettings(context){
  const document=context.ownerDocument
  const root=document.createElement('div')
  root.className='oe-gallery__style-form'
  const optionKeys=['loop','zoom','navigation','captions','fullscreen','thumbnails']
  const commit=producer=>{context.updateData(producer);render()}
  const line=(label,control)=>{
    const wrapper=document.createElement('label')
    wrapper.className='oe-gallery__style-label'
    const text=document.createElement('span')
    text.textContent=label
    wrapper.append(text,control)
    return wrapper
  }
  const input=(value,onChange,{type='text',placeholder=''}={})=>{
    const element=document.createElement('input')
    element.type=type
    element.className='oe-gallery__style-input'
    element.value=value??''
    if(placeholder)element.placeholder=placeholder
    element.addEventListener('change',()=>onChange(element.value,element))
    return element
  }
  const checkbox=(checked,onChange)=>{
    const element=document.createElement('input')
    element.type='checkbox'
    element.checked=checked
    element.addEventListener('change',()=>onChange(element.checked))
    return element
  }

  const render=()=>{
    const data=context.getData()
    root.replaceChildren()

    const layoutSelect=document.createElement('select')
    layoutSelect.className='oe-gallery__style-input'
    for(const value of GALLERY_LAYOUTS){
      const option=document.createElement('option')
      option.value=value
      option.textContent=value
      option.selected=value===data.layout
      layoutSelect.appendChild(option)
    }
    layoutSelect.addEventListener('change',()=>commit(current=>({...current,layout:layoutSelect.value})))
    root.appendChild(line(context.t(galleryLabel('layout','Layout')),layoutSelect))

    const switches=document.createElement('div')
    switches.className='oe-gallery__switch-row'
    for(const key of optionKeys){
      switches.appendChild(line(
        context.t(galleryLabel(key,key[0].toUpperCase()+key.slice(1))),
        checkbox(data.options[key]===true,value=>commit(current=>({
          ...current,
          options:{...current.options,[key]:value},
        }))),
      ))
    }
    root.appendChild(switches)

    root.appendChild(line(context.t(galleryLabel('autoplayInterval','Autoplay interval, ms')),input(
      data.options.autoplayInterval?String(data.options.autoplayInterval):'',
      (value,element)=>{
        const numeric=Number(value)
        if(String(value).trim()&&(!Number.isFinite(numeric)||numeric<=0)){
          element.value=data.options.autoplayInterval?String(data.options.autoplayInterval):''
          return
        }
        commit(current=>{
          const options={...current.options}
          if(String(value).trim())options.autoplayInterval=Math.floor(numeric)
          else delete options.autoplayInterval
          return {...current,options}
        })
      },
      {type:'number',placeholder:'3000'},
    )))

    for(const [key,label] of [['gap','Gap'],['borderRadius','Border radius'],['height','Height']]){
      root.appendChild(line(
        context.t(galleryLabel(key,label)),
        input(data.styles[key]??'',value=>commit(current=>{
          const styles={...current.styles}
          if(String(value).trim())styles[key]=String(value).trim()
          else delete styles[key]
          return {...current,styles}
        })),
      ))
    }
  }

  render()
  return root
}

/**
 * Create an immutable Gallery block definition with stable image identities and optional upload/source actions.
 * @param {{uploadFile?:UploadFn,actions?:SourceAction[],injectStyles?:boolean,css?:string}} [config]
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<any>}
 */
export function createGalleryPlugin(config={}){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Gallery configuration must be an object')
  const snapshot=Object.freeze({...config,actions:Object.freeze([...(config.actions??[])])})
  const styles=[]
  if(snapshot.injectStyles!==false)styles.push(editorStyles,sourceEditorStyles)
  if(snapshot.css)styles.push(snapshot.css)

  const optionKeys=['loop','zoom','navigation','captions','fullscreen','thumbnails']
  const capabilities=Object.freeze({
    empty:Object.freeze({isEmpty:data=>data.images.length===0}),
    conversion:Object.freeze({
      export:data=>({kind:'rich-text',data:{text:data.images.map(image=>image.caption).filter(Boolean).join('<br>')}}),
      canImport:payload=>payload?.kind==='rich-text'&&typeof payload.data?.text==='string',
      import(){return galleryDataSchema.createDefault()},
    }),
    settings:Object.freeze({
      kind:/** @type {'panel'} */('panel'),
      render:renderGallerySettings,
    }),
    paste:Object.freeze({
      accepts(input){return input.kind==='file'&&isSupportedImageFile(input.file)},
      async resolve(input,context){
        if(input.kind!=='file'||!isSupportedImageFile(input.file))return null
        const uploader=new GalleryUploader(snapshot)
        const box={images:/** @type {Array<{url:string,caption:string}>} */([])}
        await uploader.handle([input.file],images=>{box.images=images},context.signal,context.ownerDocument)
        if(context.signal.aborted||box.images.length===0)return null
        return {
          kind:/** @type {'block'} */('block'),
          data:{
            ...galleryDataSchema.createDefault(),
            images:box.images.map(image=>({
              id:context.createId('image'),
              url:image.url,
              caption:image.caption,
            })),
          },
        }
      },
    }),
  })

  return Object.freeze({
    type:'gallery',
    label:Object.freeze({key:'title',fallback:'Gallery'}),
    icon:ICON,
    styles:Object.freeze(styles),
    schema:galleryDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      const uploader=new GalleryUploader(snapshot)
      return {
        create(initial,context){
          if(destroyed)throw new Error('Gallery runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className=CSS.wrapper
          wrapper.contentEditable='false'
          wrapper.tabIndex=-1

          let data=cloneData(initial)
          let readOnly=context.isReadOnly()
          let dead=false
          const preloadEditors=()=>{if(!readOnly)preloadSourceEditor(wrapper,context.signal,['url'])}
          const tasks=new Set()
          const captionFields=new Map()

          const updateData=next=>context.updateData(()=>next)
          const syncLoading=()=>wrapper.classList.toggle(CSS.loading,tasks.size>0)
          const beginTask=()=>{
            const task=context.beginTask()
            tasks.add(task)
            task.signal.addEventListener('abort',()=>{
              tasks.delete(task)
              syncLoading()
            },{once:true})
            syncLoading()
            return task
          }
          const finishTask=task=>{
            task.cancel()
            tasks.delete(task)
            syncLoading()
          }
          const abortTasks=()=>{
            for(const task of tasks)task.cancel()
            tasks.clear()
            syncLoading()
          }

          const addImages=(images,task=null)=>{
            if(dead||readOnly)return false
            const safe=images.flatMap(image=>{
              const url=sanitizeMediaUrl(image?.url||'')
              return url?[{
                id:typeof image?.id==='string'&&image.id?image.id:null,
                url,
                caption:typeof image?.caption==='string'?image.caption:typeof image?.alt==='string'?image.alt:'',
              }]:[]
            })
            if(!safe.length)return false
            const producer=current=>({
              ...current,
              images:[
                ...current.images,
                ...safe.map(image=>({
                  ...image,
                  id:image.id??context.createId('image'),
                })),
              ],
            })
            if(task)return task.commit(producer)
            context.updateData(producer)
            return true
          }

          const resolveFiles=async files=>{
            if(readOnly||dead)return
            const accepted=files.filter(isSupportedImageFile)
            if(!accepted.length)return
            const task=beginTask()
            try{
              await uploader.handle(accepted,images=>{
                if(!task.signal.aborted)addImages(images,task)
              },task.signal,document)
            }catch(error){
              if(!task.signal.aborted)console.warn('[Gallery] Upload failed',error)
            }finally{
              finishTask(task)
            }
          }

          const chooseFiles=()=>{
            if(readOnly)return
            triggerFileInput({
              ownerDocument:document,
              accept:'image/*',
              multiple:true,
              signal:context.signal,
              onFiles:files=>void resolveFiles([...files]),
            })
          }

          const addUrl=()=>{
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
              invalidText:runtimeContext.t('invalidUrl','Enter a valid image URL.'),
              normalize:sanitizeMediaUrl,
              onSubmit:url=>addImages([{url,caption:''}]),
            })
          }

          const runAction=async action=>{
            if(readOnly||dead)return
            const task=beginTask()
            try{
              const result=await action.handler({signal:task.signal})
              if(!task.signal.aborted&&Array.isArray(result))addImages(result,task)
            }catch(error){
              if(!task.signal.aborted)console.warn('[Gallery] Source action failed',error)
            }finally{
              finishTask(task)
            }
          }

          const move=(from,to)=>{
            if(readOnly||to<0||to>=data.images.length||from===to)return
            context.updateData(current=>{
              const images=current.images.map(image=>({...image}))
              const [item]=images.splice(from,1)
              if(item)images.splice(to,0,item)
              return {...current,images}
            })
          }

          const renderImage=(image,index)=>{
            const slot=document.createElement('div')
            slot.className=CSS.slot+' '+CSS.slotFilled
            slot.dataset.imageId=image.id

            const img=document.createElement('img')
            img.className=CSS.slotImg
            setSafeUrlAttribute(img,'src',image.url,'media')
            img.alt=image.caption?stripText(image.caption):''

            const caption=document.createElement('div')
            caption.className=CSS.slotCaption
            caption.contentEditable=readOnly?'false':'true'
            caption.dataset.imageId=image.id
            caption.setAttribute('data-oe-document-input','text')
            caption.textContent=stripText(image.caption)
            captionFields.set(image.id,caption)
            slot.append(img,caption)

            if(!readOnly){
              const remove=document.createElement('button')
              remove.type='button'
              remove.className=CSS.slotRemove
              remove.textContent='×'
              remove.addEventListener('click',()=>updateData({...data,images:data.images.filter(item=>item.id!==image.id)}),{signal:context.signal})

              const earlier=document.createElement('button')
              earlier.type='button'
              earlier.textContent='←'
              earlier.disabled=index===0
              earlier.addEventListener('click',()=>move(index,index-1),{signal:context.signal})
              const later=document.createElement('button')
              later.type='button'
              later.textContent='→'
              later.disabled=index===data.images.length-1
              later.addEventListener('click',()=>move(index,index+1),{signal:context.signal})
              slot.append(remove,earlier,later)
            }
            return slot
          }

          const project=next=>{
            data=cloneData(next)
            captionFields.clear()
            wrapper.replaceChildren()
            wrapper.className=CSS.wrapper+(data.images.length?' '+CSS.filled:'')
            syncLoading()
            wrapper.dataset.layout=data.layout
            wrapper.style.cssText=''
            for(const [key,value] of Object.entries(data.styles)){
              if(key in wrapper.style)wrapper.style[key]=value
            }

            if(!data.images.length){
              const empty=document.createElement('div')
              empty.className=CSS.select
              if(readOnly){
                empty.textContent=runtimeContext.t('emptyReadonly','No images')
              }else{
                const upload=document.createElement('button')
                upload.type='button'
                upload.textContent=runtimeContext.t('upload','Upload')
                upload.addEventListener('click',chooseFiles,{signal:context.signal})
                const url=document.createElement('button')
                url.type='button'
                url.textContent=runtimeContext.t('dropzoneUrl','Insert URL')
                url.addEventListener('click',addUrl,{signal:context.signal})
                empty.append(upload,url)
                for(const action of snapshot.actions){
                  const button=document.createElement('button')
                  button.type='button'
                  button.className=CSS.selectAction
                  if(action.icon)insertTrustedHtml(button,'afterbegin',action.icon)
                  button.append(document.createTextNode(action.label))
                  button.addEventListener('click',()=>void runAction(action),{signal:context.signal})
                  empty.appendChild(button)
                }
              }
              wrapper.appendChild(empty)
              preloadEditors()
              return
            }

            const grid=document.createElement('div')
            grid.className=CSS.grid
            data.images.forEach((image,index)=>grid.appendChild(renderImage(image,index)))
            wrapper.appendChild(grid)

            if(!readOnly){
              const actions=document.createElement('div')
              actions.className=CSS.actions
              const add=document.createElement('button')
              add.type='button'
              add.className=CSS.actionBtn
              add.textContent=runtimeContext.t('add','Add images')
              add.addEventListener('click',chooseFiles,{signal:context.signal})
              actions.appendChild(add)
              for(const action of snapshot.actions){
                const button=document.createElement('button')
                button.type='button'
                button.className=CSS.actionBtn
                if(action.icon)insertTrustedHtml(button,'afterbegin',action.icon)
                button.append(document.createTextNode(action.label))
                button.addEventListener('click',()=>void runAction(action),{signal:context.signal})
                actions.appendChild(button)
              }
              wrapper.appendChild(actions)
            }
            preloadEditors()
          }

          wrapper.addEventListener('focusout',event=>{
            if(readOnly)return
            const target=/** @type {HTMLElement|null} */(event.target)
            if(!target?.classList.contains(CSS.slotCaption))return
            const id=target.dataset.imageId
            if(!id)return
            const caption=target.innerHTML.trim()
            context.updateData(current=>({...current,images:current.images.map(image=>image.id===id?{...image,caption}:image)}))
          },{signal:context.signal})

          project(data)

          return {
            element:wrapper,
            read:()=>({
              ...cloneData(data),
              images:data.images.map(image=>({
                ...image,
                caption:captionFields.get(image.id)?.innerHTML.trim()??image.caption,
              })),
            }),
            update(next){if(!dead)project(next)},
            editableFields:()=>Object.freeze(data.images.flatMap(image=>{
              const element=captionFields.get(image.id)
              return element?[Object.freeze({
                key:'image:'+image.id+':caption',
                element,
                mode:/** @type {'rich-text'} */('rich-text'),
              })]:[]
            })),
            setReadOnly(value){readOnly=value;project(data)},
            focus(){if(!dead&&!readOnly)(captionFields.get(data.images[0]?.id)??wrapper.querySelector('button'))?.focus()},
            destroy(){dead=true;abortTasks();captionFields.clear()},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}

function cloneData(data){
  return {
    images:data.images.map(image=>({...image})),
    layout:data.layout,
    styles:{...data.styles},
    options:{...data.options},
  }
}

function stripText(html){
  return String(html||'').replace(/<[^>]*>/g,'').trim()
}
