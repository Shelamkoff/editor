// @ts-check
import { setSafeUrlAttribute, setSanitizedHtml } from '../../plugin-kit/index.js'
import { insertTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { galleryDataSchema } from '../../shared/blockSchemas/gallery.js'
import { GALLERY_LAYOUTS } from '../../shared/blockOptions.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { isSupportedImageFile, triggerFileInput } from '../shared/fileInput.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'
import { createMediaDropzone } from '../shared/mediaDropzone.js'
import { GalleryUploader } from './uploader.js'
import { CSS } from './css.js'
import { ICON, LAYOUT_ICONS, ICON_SETTINGS, ICON_ADD_IMAGE, ICON_CHEVRON_RIGHT, ICON_BACK, ICON_UPLOAD, ICON_URL } from './icons.js'
import { gallerySlotCount, autoGalleryLayout, galleryOrientation } from '../../shared/galleryLayout.js'
import { mountGalleryMasonry } from '../../shared/galleryMasonry.js'
import { createTextSelectionSlice } from '../shared/textSelectionSlice.js'
import { createTextClipboardSlice } from '../shared/textClipboardSlice.js'
import { retainControlFocus } from '../shared/retainControlFocus.js'
import { positionPluginPanel } from '../shared/positionPluginPanel.js'

const editorStyles=new URL('./gallery.css',import.meta.url).href
const sourceEditorStyles=new URL('../shared/sourceEditor.css',import.meta.url).href

/**
 * @typedef {(file:File,context:{signal:AbortSignal})=>Promise<{url:string,alt?:string}>} UploadFn
 * @typedef {{label:string,icon?:string,handler:(context:{signal:AbortSignal})=>Promise<Array<{url:string,alt?:string}>|null>}} SourceAction
 */


function galleryLabel(key,fallback){return Object.freeze({key,fallback})}

function renderGallerySettings(context, { visualLayouts = false } = {}){
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
    element.className=CSS.switch+(checked?' '+CSS.switchActive:'')
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
    if(visualLayouts){
      const grid=document.createElement('div')
      grid.className=CSS.layoutGrid
      for(const layout of GALLERY_LAYOUTS){
        const button=document.createElement('button')
        button.type='button'
        button.className=CSS.layoutBtn
        button.classList.toggle(CSS.layoutBtnActive,layout===data.layout)
        button.dataset.layout=layout
        const labelKey=layout==='auto'?'layoutAuto':layout==='masonry'?'layoutMasonry':layout==='triptych'?'layoutTriptych':'layoutTemplate'
        button.title=context.t(galleryLabel(labelKey,'Layout'))+(labelKey==='layoutTemplate'?' '+layout:'')
        button.setAttribute('aria-label',button.title)
        button.setAttribute('aria-pressed',String(layout===data.layout))
        insertTrustedHtml(button,'afterbegin',LAYOUT_ICONS[layout]??'')
        button.addEventListener('mousedown',event=>event.preventDefault())
        button.addEventListener('click',()=>commit(current=>({...current,layout})))
        grid.appendChild(button)
      }
      root.appendChild(grid)
    }else root.appendChild(line(context.t(galleryLabel('layout','Layout')),layoutSelect))

    const switches=document.createElement('div')
    for(const key of optionKeys){
      const option=line(
        context.t(galleryLabel('opt'+key[0].toUpperCase()+key.slice(1),key[0].toUpperCase()+key.slice(1))),
        checkbox(data.options[key]===true,value=>commit(current=>({
          ...current,
          options:{...current.options,[key]:value},
        }))),
      )
      option.className=CSS.switchRow
      option.querySelector('span').className=CSS.switchLabel
      switches.appendChild(option)
    }
    root.appendChild(switches)

    root.appendChild(line(context.t(galleryLabel('optAutoplay','Autoplay interval, ms')),input(
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

    for(const [key,labelKey,label] of [['gap','styleGap','Gap'],['borderRadius','styleRadius','Border radius'],['height','styleHeight','Height']]){
      root.appendChild(line(
        context.t(galleryLabel(labelKey,label)),
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
    selectionSlice:createTextSelectionSlice(galleryDataSchema),
    clipboard:createTextClipboardSlice(galleryDataSchema),
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
          let viewController=null
          let dragId=null

          const updateData=next=>retainControlFocus(wrapper,()=>context.updateData(()=>next))
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
            if(task)return retainControlFocus(wrapper,()=>task.commit(producer))
            retainControlFocus(wrapper,()=>context.updateData(producer))
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
            retainControlFocus(wrapper,()=>context.updateData(current=>{
              const images=current.images.map(image=>({...image}))
              const [item]=images.splice(from,1)
              if(item)images.splice(to,0,item)
              return {...current,images}
            }))
          }

          const renderImage=(image,index)=>{
            const slot=document.createElement('div')
            slot.className=CSS.slot+' '+CSS.slotFilled
            slot.dataset.imageId=image.id
            slot.draggable=!readOnly

            const img=document.createElement('img')
            img.className=CSS.slotImg
            setSafeUrlAttribute(img,'src',image.url,'media')
            img.alt=image.caption?stripText(image.caption):''
            img.draggable=false

            const caption=document.createElement('div')
            caption.className=CSS.slotCaption
            caption.contentEditable=readOnly?'false':'true'
            caption.dataset.imageId=image.id
            caption.setAttribute('data-oe-document-input','text')
            if(image.caption)setSanitizedHtml(caption,image.caption)
            caption.dataset.placeholder=runtimeContext.t('caption','Caption')
            caption.addEventListener('keydown',event=>{
              if(event.key==='Enter'){
                event.preventDefault()
                event.stopPropagation()
                caption.blur()
                wrapper.focus()
              }else if(event.key==='Backspace'&&!caption.textContent?.trim()){
                event.preventDefault()
                event.stopPropagation()
              }
            },{signal:context.signal})
            captionFields.set(image.id,caption)
            slot.append(img,caption)

            slot.addEventListener('dragstart',event=>{
              if(readOnly||document.activeElement===caption){event.preventDefault();return}
              dragId=image.id
              slot.classList.add(CSS.itemDragging)
              if(event.dataTransfer){
                event.dataTransfer.effectAllowed='move'
                event.dataTransfer.setData('text/plain',image.id)
              }
            },{signal:viewController.signal})
            slot.addEventListener('dragend',()=>{
              dragId=null
              wrapper.querySelectorAll('.'+CSS.itemDragging+',.'+CSS.slotOver+',.'+CSS.overflowItemOver)
                .forEach(element=>element.classList.remove(CSS.itemDragging,CSS.slotOver,CSS.overflowItemOver))
            },{signal:viewController.signal})
            slot.addEventListener('dragover',event=>{
              if(readOnly||!dragId||dragId===image.id)return
              event.preventDefault()
              event.stopPropagation()
              slot.classList.add(slot.classList.contains(CSS.overflowItem)?CSS.overflowItemOver:CSS.slotOver)
            },{signal:viewController.signal})
            slot.addEventListener('dragleave',()=>slot.classList.remove(CSS.slotOver,CSS.overflowItemOver),{signal:viewController.signal})
            slot.addEventListener('drop',event=>{
              if(readOnly||!dragId||dragId===image.id)return
              event.preventDefault()
              event.stopPropagation()
              const from=dragId
              dragId=null
              // Keep the logical authoring host in the transaction bookmark;
              // replacing the gallery view must not strand Undo/Redo on body.
              caption.focus()
              context.updateData(current=>{
                const images=[...current.images]
                const start=images.findIndex(item=>item.id===from)
                const end=images.findIndex(item=>item.id===image.id)
                if(start<0||end<0)return current
                ;[images[start],images[end]]=[images[end],images[start]]
                return {...current,images}
              })
            },{signal:viewController.signal})

            if(!readOnly){
              const remove=document.createElement('button')
              remove.type='button'
              remove.className=CSS.slotRemove
              remove.textContent='×'
              remove.addEventListener('click',()=>updateData({...data,images:data.images.filter(item=>item.id!==image.id)}),{signal:context.signal})

              const earlier=document.createElement('button')
              earlier.type='button'
              earlier.className='oe-gallery__slot-move oe-gallery__slot-move--backward'
              earlier.textContent='←'
              earlier.disabled=index===0
              earlier.addEventListener('click',()=>move(index,index-1),{signal:context.signal})
              const later=document.createElement('button')
              later.type='button'
              later.className='oe-gallery__slot-move oe-gallery__slot-move--forward'
              later.textContent='→'
              later.disabled=index===data.images.length-1
              later.addEventListener('click',()=>move(index,index+1),{signal:context.signal})
              slot.append(remove,earlier,later)
            }
            return slot
          }

          const project=next=>{
            viewController?.abort()
            const Ctor=document.defaultView?.AbortController??AbortController
            viewController=new Ctor()
            const viewSignal=viewController.signal
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
              const empty=createMediaDropzone({ownerDocument:document,prefix:'oe-gallery',icon:ICON,
                uploadText:runtimeContext.t('dropzoneUpload','Upload'),afterText:runtimeContext.t('dropzoneText','images from your device or drag and drop them here'),
                urlPrefix:runtimeContext.t('dropzoneUrlPrefix','or'),emptyText:runtimeContext.t('emptyReadonly','No images'),readOnly,signal:viewSignal,
                onUpload:chooseFiles,inlineActions:[{label:runtimeContext.t('dropzoneUrl','Insert URL'),onSelect:addUrl}],
                actions:snapshot.actions.map(action=>({...action,onSelect:()=>void runAction(action)})),
              })
              wrapper.appendChild(empty)
              preloadEditors()
              return
            }

            const grid=document.createElement('div')
            const count=data.layout==='auto'?Math.min(data.images.length,6):gallerySlotCount(data.layout)
            const layout=data.layout==='auto'?autoGalleryLayout(Math.min(data.images.length,6)):data.layout
            grid.className=CSS.grid+' eg--'+layout
            const visible=data.images.slice(0,count)
            const slots=visible.map((image,index)=>renderImage(image,index))
            slots.forEach(slot=>grid.appendChild(slot))
            if(Number.isFinite(count)&&data.layout!=='auto'){
              for(let index=visible.length;index<count;index++){
                const empty=document.createElement('button')
                empty.type='button'
                empty.className=CSS.slot+' '+CSS.slotEmpty
                empty.textContent='+'
                empty.disabled=readOnly
                empty.setAttribute('aria-label',runtimeContext.t('add','Add images'))
                empty.addEventListener('click',chooseFiles,{signal:context.signal})
                grid.appendChild(empty)
              }
            }
            if(data.styles.gap)grid.style.gap=data.styles.gap
            if(data.styles.height)grid.style.height=data.styles.height
            for(const slot of slots)if(data.styles.borderRadius)slot.style.borderRadius=data.styles.borderRadius
            wrapper.appendChild(grid)
            if(data.layout==='masonry')mountGalleryMasonry(grid,slots,{signal:viewController.signal})
            if(data.layout==='auto'&&visible.length>2){
              const orientations=new Array(visible.length)
              let loaded=0
              slots.forEach((slot,index)=>{
                const image=slot.querySelector('img')
                let settled=false
                const ready=()=>{
                  if(settled||viewSignal.aborted)return
                  settled=true
                  orientations[index]=galleryOrientation(image)
                  if(++loaded===slots.length)grid.className=CSS.grid+' eg--'+autoGalleryLayout(slots.length,orientations)
                }
                image.addEventListener('load',ready,{once:true,signal:viewController.signal})
                image.addEventListener('error',ready,{once:true,signal:viewController.signal})
                if(image.complete)queueMicrotask(ready)
              })
            }
            if(data.images.length>visible.length){
              const overflow=document.createElement('div')
              overflow.className=CSS.overflow
              data.images.slice(visible.length).forEach((image,index)=>{
                const item=renderImage(image,visible.length+index)
                item.classList.add(CSS.overflowItem)
                overflow.appendChild(item)
              })
              wrapper.appendChild(overflow)
            }

            if(!readOnly){
              const actions=document.createElement('div')
              actions.className=CSS.actions
              const mainView=document.createElement('div')
              mainView.className=CSS.actionsView
              const sourceView=document.createElement('div')
              sourceView.className=CSS.actionsView
              sourceView.hidden=true
              const showSources=open=>{mainView.hidden=open;sourceView.hidden=!open}
              const sourceButton=(label,icon,callback)=>{
                const button=document.createElement('button')
                button.type='button';button.className=CSS.actionBtn
                insertTrustedHtml(button,'afterbegin',icon)
                button.append(document.createTextNode(label))
                button.addEventListener('click',()=>{showSources(false);callback()},{signal:viewSignal})
                return button
              }
              sourceView.append(
                sourceButton(runtimeContext.t('back','Back'),ICON_BACK,()=>{}),
                sourceButton(runtimeContext.t('upload','Upload'),ICON_UPLOAD,chooseFiles),
              )
              const dropdown=document.createElement('div')
              dropdown.className=CSS.dropdown
              const settings=document.createElement('button')
              settings.type='button'
              settings.className=CSS.actionBtn
              insertTrustedHtml(settings,'afterbegin',ICON_SETTINGS)
              settings.append(document.createTextNode(runtimeContext.t('settings','Settings')))
              settings.setAttribute('aria-haspopup','true')
              settings.setAttribute('aria-expanded','false')
              const panel=document.createElement('div')
              panel.className=CSS.dropdownPanel
              panel.setAttribute('role','group')
              panel.setAttribute('aria-label',settings.textContent)
              panel.appendChild(renderGallerySettings({
                ownerDocument:document,
                getData:()=>context.getData(),
                t:label=>runtimeContext.t(label.key,label.fallback),
                updateData:producer=>{
                  wrapper.focus({preventScroll:true})
                  return retainControlFocus(wrapper,()=>context.updateData(producer))
                },
              },{visualLayouts:true}))
              const setOpen=open=>{
                dropdown.classList.toggle(CSS.dropdownOpen,open)
                settings.setAttribute('aria-expanded',String(open))
                if(open)positionPluginPanel(panel,dropdown,{preferAbove:true})
              }
              settings.addEventListener('mousedown',event=>event.preventDefault(),{signal:viewSignal})
              settings.addEventListener('click',()=>setOpen(settings.getAttribute('aria-expanded')!=='true'),{signal:viewSignal})
              dropdown.addEventListener('keydown',event=>{
                if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);settings.focus()}
              },{signal:viewSignal})
              document.addEventListener('click',event=>{if(!dropdown.contains(event.target))setOpen(false)},{signal:viewSignal})
              dropdown.append(settings,panel)
              mainView.appendChild(dropdown)
              const add=document.createElement('button')
              add.type='button'
              add.className=CSS.actionBtn
              insertTrustedHtml(add,'afterbegin',ICON_ADD_IMAGE)
              add.append(document.createTextNode(runtimeContext.t('addMore','Add')))
              insertTrustedHtml(add,'beforeend',ICON_CHEVRON_RIGHT)
              add.addEventListener('click',()=>{setOpen(false);showSources(true)},{signal:viewSignal})
              mainView.appendChild(add)
              const url=document.createElement('button')
              url.type='button'
              url.className=CSS.actionBtn
              insertTrustedHtml(url,'afterbegin',ICON_URL)
              url.append(document.createTextNode('URL'))
              url.addEventListener('click',()=>{showSources(false);addUrl()},{signal:viewSignal})
              const clear=document.createElement('button')
              clear.type='button'
              clear.className=CSS.actionBtn+' '+CSS.actionBtnDanger
              clear.textContent=runtimeContext.t('deleteAll','Delete all')
              clear.addEventListener('click',()=>{abortTasks();retainControlFocus(wrapper,()=>context.updateData(current=>({...current,images:[]})))},{signal:context.signal})
              mainView.appendChild(clear)
              for(const action of snapshot.actions){
                const button=document.createElement('button')
                button.type='button'
                button.className=CSS.actionBtn
                if(action.icon)insertTrustedHtml(button,'afterbegin',action.icon)
                button.append(document.createTextNode(action.label))
                button.addEventListener('click',()=>{showSources(false);void runAction(action)},{signal:viewSignal})
                sourceView.appendChild(button)
              }
              sourceView.appendChild(url)
              actions.append(mainView,sourceView)
              wrapper.appendChild(actions)
            }
            preloadEditors()
          }

          wrapper.addEventListener('dragover',event=>{
            if(readOnly||dragId||!event.dataTransfer?.types.includes('Files'))return
            event.preventDefault()
            if(event.dataTransfer)event.dataTransfer.dropEffect='copy'
          },{signal:context.signal})
          wrapper.addEventListener('drop',event=>{
            if(readOnly||dragId||!event.dataTransfer?.files.length)return
            event.preventDefault();event.stopPropagation()
            void resolveFiles([...event.dataTransfer.files])
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
            focus(target){
              if(dead||readOnly)return
              const id=target?.fieldKey?.match(/^image:(.+):caption$/)?.[1]??data.images[0]?.id
              ;(captionFields.get(id)??wrapper)?.focus()
            },
            destroy(){dead=true;viewController?.abort();abortTasks();captionFields.clear()},
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
