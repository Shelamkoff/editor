// @ts-check
import {
  READ_ONLY_INTERACTIVE_ATTRIBUTE,
  insertTrustedHtml,
  setSafeUrlAttribute,
} from '../../plugin-kit/index.js'
import { carouselDataSchema } from '../../shared/blockSchemas/carousel.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { sanitizeRawHtml, setSanitizedRawHtml } from '../../shared/sanitize/index.js'
import { triggerFileInput } from '../shared/fileInput.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'
import { ICON } from './icons.js'

const editorStyles=new URL('./carousel.css',import.meta.url).href
const sourceEditorStyles=new URL('../shared/sourceEditor.css',import.meta.url).href
const NAV_PREV='‹'
const NAV_NEXT='›'

/**
 * @typedef {{id:string,type:'image'|'video'|'html',src?:string,poster?:string,alt?:string,html?:string,caption:string}} Slide
 * @typedef {(file:File,context:{signal:AbortSignal})=>Promise<{url:string,poster?:string}>} UploadFn
 * @typedef {{label:string,icon?:string,handler:(context:{signal:AbortSignal})=>Promise<Slide[]|null>}} SourceAction
 */

/**
 * Create an immutable mixed-media Carousel block definition with optional upload and custom source actions.
 * @param {{uploadFile?:UploadFn,actions?:SourceAction[],injectStyles?:boolean,css?:string}} [config]
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<any>}
 */
export function createCarouselPlugin(config={}){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Carousel configuration must be an object')
  const snapshot=Object.freeze({...config,actions:Object.freeze([...(config.actions??[])])})
  const styles=[]
  if(snapshot.injectStyles!==false)styles.push(editorStyles,sourceEditorStyles)
  if(snapshot.css)styles.push(snapshot.css)

  const capabilities=Object.freeze({
    empty:Object.freeze({isEmpty:data=>data.slides.length===0}),
    conversion:Object.freeze({
      export:data=>({kind:'rich-text',data:{text:data.slides.map(slide=>slide.caption||slide.alt||'').filter(Boolean).join('<br>')}}),
      canImport:payload=>payload?.kind==='rich-text'&&typeof payload.data?.text==='string',
      import(){return carouselDataSchema.createDefault()},
    }),
    settings:Object.freeze({
      kind:/** @type {'actions'} */('actions'),
      actions(data){
        return [
          Object.freeze({id:'loop',label:Object.freeze({key:'loop',fallback:'Loop'}),active:data.options.loop}),
          Object.freeze({id:'autoplay',label:Object.freeze({key:'autoplay',fallback:'Autoplay'}),active:data.options.autoplay}),
          Object.freeze({id:'navigation',label:Object.freeze({key:'navigation',fallback:'Navigation'}),active:data.options.navigation}),
          Object.freeze({id:'pagination',label:Object.freeze({key:'pagination',fallback:'Pagination'}),active:data.options.pagination}),
          Object.freeze({id:'thumbnails',label:Object.freeze({key:'thumbnails',fallback:'Thumbnails'}),active:data.options.thumbnails}),
        ]
      },
      apply(data,actionId){
        if(!['loop','autoplay','navigation','pagination','thumbnails'].includes(actionId))throw new RangeError('Unknown carousel setting: '+actionId)
        return {...data,options:{...data.options,[actionId]:!data.options[actionId]}}
      },
    }),
  })

  return Object.freeze({
    type:'carousel',
    label:Object.freeze({key:'title',fallback:'Carousel'}),
    icon:ICON,
    styles:Object.freeze(styles),
    schema:carouselDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      const objectUrls=new Map()
      return {
        create(initial,context){
          if(destroyed)throw new Error('Carousel runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-carousel-block'
          wrapper.contentEditable='false'
          wrapper.tabIndex=-1

          let data=cloneData(initial)
          let readOnly=context.isReadOnly()
          let dead=false
          let activeIndex=0
          let taskController=null
          let autoplayTimer=null
          const captionFields=new Map()

          const clearAutoplay=()=>{
            if(autoplayTimer!==null){
              ;(document.defaultView??globalThis).clearTimeout(autoplayTimer)
              autoplayTimer=null
            }
          }
          const scheduleAutoplay=()=>{
            clearAutoplay()
            if(dead||data.slides.length<2||!data.options.autoplay)return
            const delay=Math.max(250,Number(data.options.autoplayDelay)||3000)
            autoplayTimer=(document.defaultView??globalThis).setTimeout(()=>{
              activate(activeIndex+1)
              scheduleAutoplay()
            },delay)
          }
          const activate=index=>{
            if(data.slides.length===0){activeIndex=0;return}
            if(data.options.loop)activeIndex=(index+data.slides.length)%data.slides.length
            else activeIndex=Math.max(0,Math.min(index,data.slides.length-1))
            project()
          }
          const updateData=next=>context.updateData(()=>next)

          const beginTask=()=>{
            taskController?.abort()
            const Ctor=document.defaultView?.AbortController??AbortController
            taskController=new Ctor()
            const abort=()=>taskController?.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:taskController.signal})
            return taskController
          }

          const normalizeSlide=slide=>{
            try{
              const encoded=carouselDataSchema.encode({...data,slides:[slide]}).data.slides[0]
              return encoded??null
            }catch{return null}
          }

          const addSlides=slides=>{
            if(dead||readOnly)return
            const valid=slides.flatMap(slide=>{
              const normalized=normalizeSlide(slide)
              return normalized?[normalized]:[]
            })
            if(valid.length===0)return
            updateData({...data,slides:[...data.slides,...valid]})
          }

          const fileType=file=>{
            const type=(file.type||'').toLowerCase()
            if(type.startsWith('image/'))return 'image'
            if(type.startsWith('video/'))return 'video'
            if(!type&&/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name))return 'image'
            if(!type&&/\.(?:m4v|mov|mp4|ogg|ogv|webm)$/i.test(file.name))return 'video'
            return null
          }

          const readDataUrl=(file,signal)=>new Promise((resolve,reject)=>{
            const Reader=document.defaultView?.FileReader??FileReader
            const reader=new Reader()
            const abort=()=>reader.abort()
            signal.addEventListener('abort',abort,{once:true})
            reader.onload=()=>{signal.removeEventListener('abort',abort);resolve(typeof reader.result==='string'?reader.result:'')}
            reader.onerror=()=>{signal.removeEventListener('abort',abort);reject(reader.error||new Error('Failed to read file'))}
            reader.onabort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason||new Error('Aborted'))}
            reader.readAsDataURL(file)
          })

          const resolveFiles=async files=>{
            if(readOnly||dead)return
            const controller=beginTask()
            /** @type {Slide[]} */
            const slides=[]
            for(const file of files){
              if(controller.signal.aborted)break
              const type=fileType(file)
              if(!type)continue
              try{
                let src=''
                let poster=''
                if(snapshot.uploadFile){
                  const result=await snapshot.uploadFile(file,{signal:controller.signal})
                  src=sanitizeMediaUrl(result?.url||'')
                  poster=sanitizeMediaUrl(result?.poster||'')
                }else if(type==='image'){
                  src=sanitizeMediaUrl(String(await readDataUrl(file,controller.signal)))
                }else{
                  const URLCtor=document.defaultView?.URL??URL
                  src=URLCtor.createObjectURL(file)
                  objectUrls.set(src,URLCtor)
                }
                if(src)slides.push({
                  id:context.createId('slide'),
                  type,
                  src,
                  ...(poster?{poster}:{}),
                  alt:file.name||'',
                  caption:'',
                })
              }catch(error){
                if(!controller.signal.aborted)console.warn('[Carousel] File resolution failed',error)
              }
            }
            if(!controller.signal.aborted)addSlides(slides)
          }

          const chooseFiles=()=>{
            if(readOnly)return
            triggerFileInput({
              ownerDocument:document,
              accept:'image/*,video/*',
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
              title:runtimeContext.t('urlEditorTitle','Insert media by URL'),
              label:runtimeContext.t('urlEditorLabel','Media URL'),
              placeholder:'https://',
              submitText:runtimeContext.t('insert','Insert'),
              cancelText:runtimeContext.t('cancel','Cancel'),
              invalidText:runtimeContext.t('invalidUrl','Invalid media URL'),
              normalize:sanitizeMediaUrl,
              onSubmit:url=>addSlides([{
                id:context.createId('slide'),
                type:/\.(?:m4v|mov|mp4|ogg|ogv|webm)(?:[?#]|$)/i.test(url)?'video':'image',
                src:url,
                alt:'',
                caption:'',
              }]),
            })
          }

          const addHtml=()=>{
            if(readOnly)return
            openSourceEditor({
              wrapper,
              signal:context.signal,
              kind:'html',
              title:runtimeContext.t('htmlEditorTitle','Insert HTML slide'),
              label:runtimeContext.t('htmlEditorLabel','HTML'),
              placeholder:'<div>...</div>',
              submitText:runtimeContext.t('insert','Insert'),
              cancelText:runtimeContext.t('cancel','Cancel'),
              invalidText:runtimeContext.t('invalidHtml','Invalid HTML'),
              normalize:value=>sanitizeRawHtml(value,document),
              onSubmit:html=>addSlides([{id:context.createId('slide'),type:'html',html,caption:''}]),
            })
          }

          const runAction=async action=>{
            if(readOnly||dead)return
            const controller=beginTask()
            try{
              const result=await action.handler({signal:controller.signal})
              if(!controller.signal.aborted&&Array.isArray(result)){
                addSlides(result.map(slide=>({...slide,id:slide.id||context.createId('slide')})))
              }
            }catch(error){
              if(!controller.signal.aborted)console.warn('[Carousel] Source action failed',error)
            }
          }

          const renderMedia=(slide,stage)=>{
            const media=document.createElement('div')
            media.className='oe-carousel-block__media'
            if(slide.type==='image'){
              const image=document.createElement('img')
              setSafeUrlAttribute(image,'src',slide.src||'','media')
              image.alt=slide.alt||''
              media.appendChild(image)
            }else if(slide.type==='video'){
              const video=document.createElement('video')
              video.controls=true
              video.preload='metadata'
              setSafeUrlAttribute(video,'src',slide.src||'','media')
              if(slide.poster)setSafeUrlAttribute(video,'poster',slide.poster,'media')
              media.appendChild(video)
            }else{
              const html=document.createElement('div')
              html.className='oe-carousel-block__html'
              setSanitizedRawHtml(html,slide.html||'')
              media.appendChild(html)
            }
            stage.appendChild(media)
          }

          const project=()=>{
            clearAutoplay()
            captionFields.clear()
            wrapper.replaceChildren()
            wrapper.classList.toggle('oe-carousel-block--filled',data.slides.length>0)

            if(data.slides.length===0){
              const empty=document.createElement('div')
              empty.className='oe-carousel-block__empty'
              if(readOnly){
                empty.textContent=runtimeContext.t('emptyReadonly','No slides')
              }else{
                const upload=document.createElement('button')
                upload.type='button'
                upload.textContent=runtimeContext.t('upload','Upload')
                upload.addEventListener('click',chooseFiles,{signal:context.signal})
                const byUrl=document.createElement('button')
                byUrl.type='button'
                byUrl.textContent=runtimeContext.t('dropzoneUrl','Insert URL')
                byUrl.addEventListener('click',addUrl,{signal:context.signal})
                const byHtml=document.createElement('button')
                byHtml.type='button'
                byHtml.textContent=runtimeContext.t('dropzoneHtml','Insert HTML')
                byHtml.addEventListener('click',addHtml,{signal:context.signal})
                empty.append(upload,byUrl,byHtml)
                for(const action of snapshot.actions){
                  const button=document.createElement('button')
                  button.type='button'
                  if(action.icon)insertTrustedHtml(button,'afterbegin',action.icon)
                  button.append(document.createTextNode(action.label))
                  button.addEventListener('click',()=>void runAction(action),{signal:context.signal})
                  empty.appendChild(button)
                }
              }
              wrapper.appendChild(empty)
              return
            }

            activeIndex=Math.max(0,Math.min(activeIndex,data.slides.length-1))
            const slide=data.slides[activeIndex]
            const stage=document.createElement('div')
            stage.className='oe-carousel-block__stage'
            if(data.options.aspectRatio&&data.options.aspectRatio!=='auto')stage.style.aspectRatio=data.options.aspectRatio
            renderMedia(slide,stage)

            const caption=document.createElement('div')
            caption.className='oe-carousel-block__caption'
            caption.contentEditable=readOnly?'false':'true'
            caption.dataset.slideId=slide.id
            caption.setAttribute('data-oe-document-input','text')
            caption.textContent=slide.caption||''
            captionFields.set(slide.id,caption)
            stage.appendChild(caption)

            if(data.options.navigation&&data.slides.length>1){
              const prev=document.createElement('button')
              prev.type='button'
              prev.className='oe-carousel-block__nav oe-carousel-block__nav--prev'
              prev.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE,'')
              prev.textContent=NAV_PREV
              prev.addEventListener('click',()=>activate(activeIndex-1),{signal:context.signal})
              const next=document.createElement('button')
              next.type='button'
              next.className='oe-carousel-block__nav oe-carousel-block__nav--next'
              next.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE,'')
              next.textContent=NAV_NEXT
              next.addEventListener('click',()=>activate(activeIndex+1),{signal:context.signal})
              stage.append(prev,next)
            }

            if(data.options.pagination&&data.slides.length>1){
              const dots=document.createElement('div')
              dots.className='oe-carousel-block__dots'
              data.slides.forEach((item,index)=>{
                const dot=document.createElement('button')
                dot.type='button'
                dot.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE,'')
                dot.className='oe-carousel-block__dot'
                dot.classList.toggle('oe-carousel-block__dot--active',index===activeIndex)
                dot.addEventListener('click',()=>activate(index),{signal:context.signal})
                dots.appendChild(dot)
              })
              stage.appendChild(dots)
            }
            wrapper.appendChild(stage)

            if(!readOnly){
              const actions=document.createElement('div')
              actions.className='oe-carousel-block__actions'
              const add=document.createElement('button')
              add.type='button'
              add.textContent=runtimeContext.t('add','Add')
              add.addEventListener('click',chooseFiles,{signal:context.signal})
              const remove=document.createElement('button')
              remove.type='button'
              remove.textContent=runtimeContext.t('remove','Remove slide')
              remove.addEventListener('click',()=>{
                const id=slide.id
                context.updateData(current=>({...current,slides:current.slides.filter(item=>item.id!==id)}))
              },{signal:context.signal})
              const earlier=document.createElement('button')
              earlier.type='button'
              earlier.textContent='←'
              earlier.disabled=activeIndex===0
              earlier.addEventListener('click',()=>moveSlide(activeIndex,activeIndex-1),{signal:context.signal})
              const later=document.createElement('button')
              later.type='button'
              later.textContent='→'
              later.disabled=activeIndex===data.slides.length-1
              later.addEventListener('click',()=>moveSlide(activeIndex,activeIndex+1),{signal:context.signal})
              actions.append(add,remove,earlier,later)
              wrapper.appendChild(actions)
            }

            if(data.options.thumbnails&&data.slides.length>1){
              const thumbs=document.createElement('div')
              thumbs.className='oe-carousel-block__thumbnails'
              data.slides.forEach((item,index)=>{
                const button=document.createElement('button')
                button.type='button'
                button.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE,'')
                button.textContent=String(index+1)
                button.addEventListener('click',()=>activate(index),{signal:context.signal})
                thumbs.appendChild(button)
              })
              wrapper.appendChild(thumbs)
            }
            scheduleAutoplay()
          }

          const moveSlide=(from,to)=>{
            if(readOnly||from===to||to<0||to>=data.slides.length)return
            const activeId=data.slides[activeIndex]?.id
            context.updateData(current=>{
              const slides=current.slides.map(slide=>({...slide}))
              const [moved]=slides.splice(from,1)
              if(moved)slides.splice(to,0,moved)
              return {...current,slides}
            })
            queueMicrotask(()=>{
              const index=data.slides.findIndex(slide=>slide.id===activeId)
              if(index>=0)activeIndex=index
            })
          }

          wrapper.addEventListener('focusout',event=>{
            const target=/** @type {HTMLElement|null} */(event.target)
            if(readOnly||!target?.classList.contains('oe-carousel-block__caption'))return
            const id=target.dataset.slideId
            if(!id)return
            const value=target.textContent?.trim()||''
            context.updateData(current=>({...current,slides:current.slides.map(slide=>slide.id===id?{...slide,caption:value}:slide)}))
          },{signal:context.signal})

          preloadSourceEditor(wrapper,context.signal,['url','html'])
          project()

          return {
            element:wrapper,
            read:()=>({
              slides:data.slides.map(slide=>{
                const field=captionFields.get(slide.id)
                return field?{...slide,caption:field.textContent?.trim()||''}:{...slide}
              }),
              options:{...data.options},
            }),
            update(next){
              const activeId=data.slides[activeIndex]?.id
              data=cloneData(next)
              const nextIndex=activeId?data.slides.findIndex(slide=>slide.id===activeId):-1
              activeIndex=nextIndex>=0?nextIndex:Math.min(activeIndex,Math.max(0,data.slides.length-1))
              project()
            },
            editableFields:()=>Object.freeze([...captionFields].map(([id,element])=>Object.freeze({
              key:'slide:'+id+':caption',
              element,
              mode:/** @type {'plain-text'} */('plain-text'),
            }))),
            setReadOnly(value){readOnly=value;project();if(value)taskController?.abort()},
            focus(){if(!dead&&!readOnly)(captionFields.get(data.slides[activeIndex]?.id)??wrapper.querySelector('button'))?.focus()},
            destroy(){dead=true;clearAutoplay();taskController?.abort();captionFields.clear()},
          }
        },
        destroy(){
          destroyed=true
          for(const [url,URLCtor] of objectUrls)URLCtor.revokeObjectURL(url)
          objectUrls.clear()
        },
      }
    },
  })
}

function cloneData(data){
  return {slides:data.slides.map(slide=>({...slide})),options:{...data.options}}
}
