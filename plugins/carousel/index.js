// @ts-check
import {
  READ_ONLY_INTERACTIVE_ATTRIBUTE,
  setSafeUrlAttribute,
  setSanitizedHtml,
} from '../../plugin-kit/index.js'
import { insertTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { carouselDataSchema } from '../../shared/blockSchemas/carousel.js'
import { createTextSelectionSlice } from '../shared/textSelectionSlice.js'
import { createTextClipboardSlice } from '../shared/textClipboardSlice.js'
import { retainControlFocus } from '../shared/retainControlFocus.js'
import { normalizeCarouselAspectRatio } from '../../shared/carouselData.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { sanitizeRawHtml, setSanitizedRawHtml } from '../../shared/sanitize/index.js'
import { triggerFileInput } from '../shared/fileInput.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'
import { createMediaDropzone } from '../shared/mediaDropzone.js'
import { createPluginPanelPositioner } from '../shared/positionPluginPanel.js'
import { createPluginLayer } from '../shared/layer.js'
import { ICON, ICON_SETTINGS, ICON_REPLACE, ICON_CHEVRON, ICON_BACK, ICON_UPLOAD, ICON_URL, ICON_CODE } from './icons.js'

const editorStyles=new URL('./carousel.css',import.meta.url).href
const sourceEditorStyles=new URL('../shared/sourceEditor.css',import.meta.url).href
const NAV_PREV='‹'
const NAV_NEXT='›'

/**
 * @typedef {{id:string,type:'image'|'video'|'html',src?:string,poster?:string,alt?:string,html?:string,caption?:string}} Slide
 * @typedef {(file:File,context:{signal:AbortSignal})=>Promise<{url:string,poster?:string}>} UploadFn
 * @typedef {{label:string,icon?:string,handler:(context:{signal:AbortSignal})=>Promise<Slide[]|null>}} SourceAction
 */



function carouselFileType(file){
  const type=String(file?.type||'').toLowerCase()
  if(type.startsWith('image/'))return 'image'
  if(type.startsWith('video/'))return 'video'
  const name=String(file?.name||'')
  if(!type&&/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(name))return 'image'
  if(!type&&/\.(?:m4v|mov|mp4|ogg|ogv|webm)$/i.test(name))return 'video'
  return null
}

function readCarouselDataUrl(file,signal,ownerDocument){
  return new Promise((resolve,reject)=>{
    const Reader=ownerDocument.defaultView?.FileReader??FileReader
    const reader=new Reader()
    const abort=()=>reader.abort()
    signal.addEventListener('abort',abort,{once:true})
    reader.onload=()=>{signal.removeEventListener('abort',abort);resolve(typeof reader.result==='string'?reader.result:'')}
    reader.onerror=()=>{signal.removeEventListener('abort',abort);reject(reader.error||new Error('Failed to read file'))}
    reader.onabort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason||new Error('Aborted'))}
    reader.readAsDataURL(file)
  })
}

function carouselLabel(key,fallback){
  return Object.freeze({key,fallback})
}

/**
 * Render model-first Carousel settings. The panel reads and writes canonical
 * CarouselData only; it never treats the mounted block DOM as persistence.
 * @param {import('../../plugin-kit/types').SettingsPanelContext<any>} context
 */
function renderCarouselSettings(context){
  const document=context.ownerDocument
  const root=document.createElement('div')
  root.className='oe-carousel-block__settings-panel'
  let selectedId=context.getData().slides[0]?.id??''

  const commit=producer=>{
    context.updateData(producer)
    render()
  }

  const field=(label,value,onChange,{multiline=false,type='text',placeholder=''}={})=>{
    const wrapper=document.createElement('label')
    wrapper.className='oe-carousel-block__field'+(multiline?' oe-carousel-block__field--multiline':'')
    const text=document.createElement('span')
    text.textContent=label
    let input
    if(multiline){
      input=document.createElement('textarea')
    }else{
      input=document.createElement('input')
      input.type=type
    }
    input.value=value
    if(placeholder)input.placeholder=placeholder
    input.addEventListener('change',()=>onChange(input.value,input))
    wrapper.append(text,input)
    return {wrapper,input}
  }

  const render=()=>{
    const data=context.getData()
    root.replaceChildren()
    if(!data.slides.length){
      const empty=document.createElement('div')
      empty.className='oe-carousel-block__settings-title'
      empty.textContent=context.t(carouselLabel('emptyReadonly','No slides'))
      root.appendChild(empty)
      return
    }
    if(!data.slides.some(slide=>slide.id===selectedId))selectedId=data.slides[0].id
    const slide=data.slides.find(item=>item.id===selectedId)??data.slides[0]

    const slideTitle=document.createElement('div')
    slideTitle.className='oe-carousel-block__settings-title'
    slideTitle.textContent=context.t(carouselLabel('currentSlide','Slide'))
    root.appendChild(slideTitle)

    const slidePicker=document.createElement('label')
    slidePicker.className='oe-carousel-block__field'
    const pickerLabel=document.createElement('span')
    pickerLabel.textContent=context.t(carouselLabel('selectedSlide','Selected slide'))
    const select=document.createElement('select')
    select.className='oe-carousel-block__slide-select'
    data.slides.forEach((item,index)=>{
      const option=document.createElement('option')
      option.value=item.id
      option.textContent=String(index+1)+' · '+(item.caption||item.alt||item.type)
      option.selected=item.id===slide.id
      select.appendChild(option)
    })
    select.addEventListener('change',()=>{selectedId=select.value;render()})
    slidePicker.append(pickerLabel,select)
    root.appendChild(slidePicker)

    if(slide.type==='html'){
      const html=field(
        context.t(carouselLabel('htmlEditorLabel','HTML')),
        slide.html||'',
        value=>{
          const safe=sanitizeRawHtml(value,document)
          commit(current=>({
            ...current,
            slides:current.slides.map(item=>item.id===slide.id?{...item,html:safe}:item),
          }))
        },
        {multiline:true},
      )
      root.appendChild(html.wrapper)
    }else{
      const embedded=/^(?:data|blob):/i.test(slide.src||'')
      const source=field(
        context.t(carouselLabel('source','Source URL')),
        embedded?'':(slide.src||''),
        (value,input)=>{
          const url=sanitizeMediaUrl(value)
          if(!url){
            input.value=embedded?'':(slide.src||'')
            return
          }
          commit(current=>({
            ...current,
            slides:current.slides.map(item=>item.id===slide.id?{...item,src:url}:item),
          }))
        },
        {placeholder:embedded?context.t(carouselLabel('embeddedSource','Local file — enter URL to replace')):'https://'},
      )
      if(embedded)source.input.dataset.oeEmbeddedSource='true'
      root.appendChild(source.wrapper)

      const alt=field(
        context.t(carouselLabel('alt','Alternative text')),
        slide.alt||'',
        value=>commit(current=>({
          ...current,
          slides:current.slides.map(item=>item.id===slide.id?{...item,alt:String(value)}:item),
        })),
      )
      root.appendChild(alt.wrapper)

      if(slide.type==='video'){
        const poster=field(
          context.t(carouselLabel('poster','Poster URL')),
          slide.poster||'',
          value=>{
            const url=sanitizeMediaUrl(value)
            if(!url&&String(value).trim())return
            commit(current=>({
              ...current,
              slides:current.slides.map(item=>{
                if(item.id!==slide.id)return item
                const next={...item}
                if(url)next.poster=url
                else delete next.poster
                return next
              }),
            }))
          },
          {placeholder:'https://'},
        )
        root.appendChild(poster.wrapper)
      }
    }

    const behavior=document.createElement('div')
    behavior.className='oe-carousel-block__settings-title'
    behavior.textContent=context.t(carouselLabel('behavior','Behavior'))
    root.appendChild(behavior)

    const switches=document.createElement('div')
    switches.className='oe-carousel-block__switches'
    for(const key of ['loop','autoplay','navigation','pagination','thumbnails']){
      const line=document.createElement('label')
      line.className='oe-carousel-block__switch'
      const text=document.createElement('span')
      text.textContent=context.t(carouselLabel(key,key[0].toUpperCase()+key.slice(1)))
      const input=document.createElement('input')
      input.type='checkbox'
      input.checked=data.options[key]===true
      input.addEventListener('change',()=>commit(current=>({
        ...current,
        options:{...current.options,[key]:input.checked},
      })))
      line.append(text,input)
      switches.appendChild(line)
    }
    root.appendChild(switches)

    const delay=field(
      context.t(carouselLabel('autoplayDelay','Autoplay delay, ms')),
      String(data.options.autoplayDelay??3000),
      (value,input)=>{
        const next=Number(value)
        if(!Number.isFinite(next)||next<=0){
          input.value=String(data.options.autoplayDelay??3000)
          return
        }
        commit(current=>({...current,options:{...current.options,autoplayDelay:Math.floor(next)}}))
      },
      {type:'number'},
    )
    root.appendChild(delay.wrapper)

    const aspect=field(
      context.t(carouselLabel('aspectRatio','Aspect ratio')),
      data.options.aspectRatio||'',
      (value,input)=>{
        const normalized=normalizeCarouselAspectRatio(value)
        if(!normalized&&String(value).trim()){
          input.value=data.options.aspectRatio||''
          return
        }
        commit(current=>{
          const options={...current.options}
          if(normalized)options.aspectRatio=normalized
          else delete options.aspectRatio
          return {...current,options}
        })
      },
      {placeholder:'16 / 9'},
    )
    root.appendChild(aspect.wrapper)
  }

  render()
  return root
}

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
    selectionSlice:createTextSelectionSlice(carouselDataSchema),
    clipboard:createTextClipboardSlice(carouselDataSchema),
    empty:Object.freeze({isEmpty:data=>data.slides.length===0}),
    conversion:Object.freeze({
      export:data=>({kind:'rich-text',data:{text:data.slides.map(slide=>slide.caption||slide.alt||'').filter(Boolean).join('<br>')}}),
      canImport:payload=>payload?.kind==='rich-text'&&typeof payload.data?.text==='string',
      import(){return carouselDataSchema.createDefault()},
    }),
    settings:Object.freeze({
      kind:/** @type {'panel'} */('panel'),
      render:renderCarouselSettings,
    }),
    paste:Object.freeze({
      accepts(input){
        return input.kind==='file'&&carouselFileType(input.file)!==null
      },
      async resolve(input,context){
        if(input.kind!=='file')return null
        const type=carouselFileType(input.file)
        if(!type)return null
        let src=''
        let poster=''
        if(snapshot.uploadFile){
          const result=await snapshot.uploadFile(input.file,{signal:context.signal})
          src=sanitizeMediaUrl(result?.url||'')
          poster=sanitizeMediaUrl(result?.poster||'')
        }else{
          src=sanitizeMediaUrl(String(await readCarouselDataUrl(input.file,context.signal,context.ownerDocument)))
        }
        if(context.signal.aborted||!src)return null
        return {
          kind:/** @type {'block'} */('block'),
          data:{
            ...carouselDataSchema.createDefault(),
            slides:[{
              id:context.createId('slide'),
              type,
              src,
              ...(type==='video'&&poster?{poster}:{}),
              alt:input.file.name||'',
              caption:'',
            }],
          },
        }
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
          const preloadEditors=()=>{if(!readOnly)preloadSourceEditor(wrapper,context.signal,['url','html'])}
          let activeIndex=0
          const tasks=new Set()
          let autoplayTimer=null
          let viewController=null
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
            const focused=document.activeElement
            const chromeFocused=wrapper.contains(focused)&&!focused.closest?.('input,textarea,select,[contenteditable="true"]')
            if(data.options.loop)activeIndex=(index+data.slides.length)%data.slides.length
            else activeIndex=Math.max(0,Math.min(index,data.slides.length-1))
            project()
            if(chromeFocused)wrapper.focus({preventScroll:true})
          }
          const updateData=next=>context.updateData(()=>next)

          const beginTask=()=>{
            const task=context.beginTask()
            tasks.add(task)
            task.signal.addEventListener('abort',()=>tasks.delete(task),{once:true})
            return task
          }
          const finishTask=task=>{
            task.cancel()
            tasks.delete(task)
          }
          const abortTasks=()=>{
            for(const task of tasks)task.cancel()
            tasks.clear()
          }

          const normalizeSlide=(slide,current)=>{
            try{
              const withId={
                ...slide,
                id:typeof slide?.id==='string'&&slide.id?slide.id:context.createId('slide'),
              }
              const candidate=withId.type==='html'
                ? {...withId,html:sanitizeRawHtml(String(withId.html??''),document).trim()}
                : withId
              if(candidate.type==='html'&&!candidate.html)return null
              const encoded=carouselDataSchema.encode({...current,slides:[candidate]}).data.slides[0]
              return encoded??null
            }catch{return null}
          }

          const addSlides=(slides,task=null)=>{
            if(dead||readOnly)return false
            const producer=current=>{
              const valid=slides.flatMap(slide=>{
                const normalized=normalizeSlide(slide,current)
                return normalized?[normalized]:[]
              })
              return valid.length?{...current,slides:[...current.slides,...valid]}:current
            }
            if(task)return retainControlFocus(wrapper,()=>task.commit(producer))
            retainControlFocus(wrapper,()=>context.updateData(producer))
            return true
          }


          const resolveFiles=async files=>{
            if(readOnly||dead)return
            const task=beginTask()
            /** @type {Slide[]} */
            const slides=[]
            const createdObjectUrls=[]
            try{
              for(const file of files){
                if(task.signal.aborted)break
                const type=carouselFileType(file)
                if(!type)continue
                try{
                  let src=''
                  let poster=''
                  if(snapshot.uploadFile){
                    const result=await snapshot.uploadFile(file,{signal:task.signal})
                    src=sanitizeMediaUrl(result?.url||'')
                    poster=sanitizeMediaUrl(result?.poster||'')
                  }else if(type==='image'){
                    src=sanitizeMediaUrl(String(await readCarouselDataUrl(file,task.signal,document)))
                  }else{
                    const URLCtor=document.defaultView?.URL??URL
                    src=URLCtor.createObjectURL(file)
                    objectUrls.set(src,URLCtor)
                    createdObjectUrls.push(src)
                  }
                  if(src)slides.push({
                    id:'',
                    type,
                    src,
                    ...(poster?{poster}:{}),
                    alt:file.name||'',
                    caption:'',
                  })
                }catch(error){
                  if(!task.signal.aborted)console.warn('[Carousel] File resolution failed',error)
                }
              }
              const committed=!task.signal.aborted&&addSlides(slides,task)
              if(!committed){
                for(const url of createdObjectUrls){
                  objectUrls.get(url)?.revokeObjectURL(url)
                  objectUrls.delete(url)
                }
              }
            }finally{
              finishTask(task)
            }
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
                id:'',
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
              onSubmit:html=>addSlides([{id:'',type:'html',html,caption:''}]),
            })
          }

          const runAction=async action=>{
            if(readOnly||dead)return
            const task=beginTask()
            try{
              const result=await action.handler({signal:task.signal})
              if(!task.signal.aborted&&Array.isArray(result))addSlides(result,task)
            }catch(error){
              if(!task.signal.aborted)console.warn('[Carousel] Source action failed',error)
            }finally{
              finishTask(task)
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
            viewController?.abort()
            const Ctor=document.defaultView?.AbortController??AbortController
            viewController=new Ctor()
            const viewSignal=viewController.signal
            clearAutoplay()
            captionFields.clear()
            wrapper.replaceChildren()
            wrapper.classList.toggle('oe-carousel-block--filled',data.slides.length>0)

            if(data.slides.length===0){
              const empty=createMediaDropzone({ownerDocument:document,prefix:'oe-carousel-block',icon:ICON,
                uploadText:runtimeContext.t('upload','Upload'),afterText:runtimeContext.t('dropzoneText','images or videos from your device or drag and drop them here'),
                urlPrefix:runtimeContext.t('dropzoneUrlPrefix','or'),emptyText:runtimeContext.t('emptyReadonly','No slides'),readOnly,signal:viewSignal,
                onUpload:chooseFiles,inlineActions:[{label:runtimeContext.t('dropzoneUrl','Insert URL'),onSelect:addUrl},{label:runtimeContext.t('dropzoneHtml','Insert HTML'),onSelect:addHtml}],
                actions:snapshot.actions.map(action=>({...action,onSelect:()=>void runAction(action)})),
              })
              empty.classList.add('oe-carousel-block__empty')
              wrapper.appendChild(empty)
              preloadEditors()
              return
            }

            activeIndex=Math.max(0,Math.min(activeIndex,data.slides.length-1))
            const slide=data.slides[activeIndex]
            const stage=document.createElement('div')
            stage.className='oe-carousel-block__stage'
            if(data.options.aspectRatio&&data.options.aspectRatio!=='auto')stage.style.aspectRatio=data.options.aspectRatio
            renderMedia(slide,stage)
            const counter=document.createElement('span')
            counter.className='oe-carousel-block__counter'
            counter.setAttribute('aria-live','polite')
            counter.textContent=`${activeIndex+1} / ${data.slides.length}`
            stage.appendChild(counter)

            const caption=document.createElement('div')
            caption.className='oe-carousel-block__caption'
            caption.contentEditable=readOnly?'false':'true'
            caption.dataset.slideId=slide.id
            caption.setAttribute('data-oe-document-input','text')
            if(slide.caption)setSanitizedHtml(caption,slide.caption)
            captionFields.set(slide.id,caption)
            stage.appendChild(caption)

            if(data.options.navigation&&data.slides.length>1){
              const prev=document.createElement('button')
              prev.type='button'
              prev.className='oe-carousel-block__nav oe-carousel-block__nav--prev oe-carousel-block__nav--previous'
              prev.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE,'')
              prev.setAttribute('aria-label',runtimeContext.t('previous','Previous slide'))
              prev.disabled=!data.options.loop&&activeIndex===0
              prev.textContent=NAV_PREV
              prev.addEventListener('click',()=>activate(activeIndex-1),{signal:viewSignal})
              const next=document.createElement('button')
              next.type='button'
              next.className='oe-carousel-block__nav oe-carousel-block__nav--next'
              next.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE,'')
              next.setAttribute('aria-label',runtimeContext.t('next','Next slide'))
              next.disabled=!data.options.loop&&activeIndex===data.slides.length-1
              next.textContent=NAV_NEXT
              next.addEventListener('click',()=>activate(activeIndex+1),{signal:viewSignal})
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
                dot.setAttribute('aria-label',runtimeContext.t('goToSlide','Go to slide {index}').replace('{index}',String(index+1)))
                dot.setAttribute('aria-current',String(index===activeIndex))
                dot.addEventListener('click',()=>activate(index),{signal:viewSignal})
                dots.appendChild(dot)
              })
              stage.appendChild(dots)
            }
            wrapper.appendChild(stage)

            if(!readOnly){
              const actions=document.createElement('div')
              actions.className='oe-carousel-block__actions'
              const mainView=document.createElement('div')
              mainView.className='oe-carousel-block__actions-view'
              const sourceView=document.createElement('div')
              sourceView.className='oe-carousel-block__actions-view'
              sourceView.hidden=true
              const showSources=open=>{mainView.hidden=open;sourceView.hidden=!open}
              const sourceButton=(label,icon,callback)=>{
                const button=document.createElement('button')
                button.type='button';button.className='oe-carousel-block__action-btn'
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
              dropdown.className='oe-carousel-block__dropdown'
              const settings=document.createElement('button')
              settings.type='button'
              settings.className='oe-carousel-block__action-btn'
              insertTrustedHtml(settings,'afterbegin',ICON_SETTINGS)
              settings.append(document.createTextNode(runtimeContext.t('settings','Settings')))
              settings.setAttribute('aria-haspopup','true')
              settings.setAttribute('aria-expanded','false')
              const panel=document.createElement('div')
              panel.className='oe-carousel-block__dropdown-panel'
              panel.inert=true
              panel.appendChild(renderCarouselSettings({
                ownerDocument:document,
                getData:()=>context.getData(),
                t:label=>runtimeContext.t(label.key,label.fallback),
                updateData:producer=>{
                  wrapper.focus({preventScroll:true})
                  return retainControlFocus(wrapper,()=>context.updateData(producer))
                },
              }))
              const settingsLayer=createPluginLayer(wrapper,viewSignal)
              const positioner=createPluginPanelPositioner(panel,dropdown,{signal:viewSignal,preferAbove:true})
              const setOpen=open=>{
                dropdown.classList.toggle('oe-carousel-block__dropdown--open',open)
                settings.setAttribute('aria-expanded',String(open))
                panel.inert=!open
                if(open){settingsLayer.open();positioner.open();settings.focus({preventScroll:true})}
                else{settingsLayer.close();positioner.close()}
              }
              settings.addEventListener('mousedown',event=>event.preventDefault(),{signal:viewSignal})
              settings.addEventListener('click',()=>setOpen(settings.getAttribute('aria-expanded')!=='true'),{signal:viewSignal})
              dropdown.addEventListener('keydown',event=>{
                if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);wrapper.focus({preventScroll:true})}
              },{signal:viewSignal})
              document.addEventListener('click',event=>{if(!dropdown.contains(event.target))setOpen(false)},{signal:viewSignal})
              dropdown.append(settings,panel)
              mainView.appendChild(dropdown)
              const add=document.createElement('button')
              add.type='button'
              add.className='oe-carousel-block__action-btn'
              insertTrustedHtml(add,'afterbegin',ICON_REPLACE)
              add.append(document.createTextNode(runtimeContext.t('add','Add')))
              insertTrustedHtml(add,'beforeend',ICON_CHEVRON)
              add.addEventListener('click',()=>{setOpen(false);showSources(true)},{signal:viewSignal})
              const byUrl=document.createElement('button')
              byUrl.type='button'
              byUrl.className='oe-carousel-block__action-btn'
              insertTrustedHtml(byUrl,'afterbegin',ICON_URL)
              byUrl.append(document.createTextNode('URL'))
              byUrl.addEventListener('click',()=>{showSources(false);addUrl()},{signal:viewSignal})
              const byHtml=document.createElement('button')
              byHtml.type='button'
              byHtml.className='oe-carousel-block__action-btn'
              insertTrustedHtml(byHtml,'afterbegin',ICON_CODE)
              byHtml.append(document.createTextNode('HTML'))
              byHtml.addEventListener('click',()=>{showSources(false);addHtml()},{signal:viewSignal})
              const remove=document.createElement('button')
              remove.type='button'
              remove.className='oe-carousel-block__action-btn oe-carousel-block__action-btn--danger'
              remove.textContent=runtimeContext.t('remove','Remove slide')
              remove.addEventListener('click',()=>{
                const id=slide.id
                retainControlFocus(wrapper,()=>context.updateData(current=>({...current,slides:current.slides.filter(item=>item.id!==id)})))
              },{signal:viewSignal})
              const earlier=document.createElement('button')
              earlier.type='button'
              earlier.className='oe-carousel-block__action-btn'
              earlier.setAttribute('aria-label',runtimeContext.t('movePrevious','Move slide backward'))
              earlier.textContent='←'
              earlier.disabled=activeIndex===0
              earlier.addEventListener('click',()=>moveSlide(activeIndex,activeIndex-1),{signal:viewSignal})
              const later=document.createElement('button')
              later.type='button'
              later.className='oe-carousel-block__action-btn'
              later.setAttribute('aria-label',runtimeContext.t('moveNext','Move slide forward'))
              later.textContent='→'
              later.disabled=activeIndex===data.slides.length-1
              later.addEventListener('click',()=>moveSlide(activeIndex,activeIndex+1),{signal:viewSignal})
              mainView.appendChild(add)
              for(const action of snapshot.actions){
                const button=document.createElement('button')
                button.type='button'
                button.className='oe-carousel-block__action-btn'
                if(action.icon)insertTrustedHtml(button,'afterbegin',action.icon)
                button.append(document.createTextNode(action.label))
                button.addEventListener('click',()=>{showSources(false);void runAction(action)},{signal:viewSignal})
                sourceView.appendChild(button)
              }
              sourceView.append(byUrl,byHtml)
              mainView.append(remove,earlier,later)
              const clear=document.createElement('button')
              clear.type='button'
              clear.className='oe-carousel-block__action-btn oe-carousel-block__action-btn--danger'
              clear.setAttribute('aria-label',runtimeContext.t('deleteAll','Remove all slides'))
              clear.textContent=runtimeContext.t('deleteAll','Remove all slides')
              clear.addEventListener('click',()=>{
                abortTasks()
                activeIndex=0
                retainControlFocus(wrapper,()=>context.updateData(current=>({...current,slides:[]})))
              },{signal:viewSignal})
              mainView.appendChild(clear)
              actions.append(mainView,sourceView)
              wrapper.appendChild(actions)
            }

            if(data.options.thumbnails&&data.slides.length>1){
              const thumbs=document.createElement('div')
              thumbs.className='oe-carousel-block__thumbnails'
              data.slides.forEach((item,index)=>{
                const button=document.createElement('button')
                button.type='button'
                button.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE,'')
                button.className='oe-carousel-block__thumbnail'
                button.classList.toggle('oe-carousel-block__thumbnail--active',index===activeIndex)
                button.setAttribute('aria-label',runtimeContext.t('goToSlide','Go to slide {index}').replace('{index}',String(index+1)))
                button.setAttribute('aria-current',String(index===activeIndex))
                const imageUrl=item.type==='image'?item.src:item.type==='video'?item.poster:''
                if(imageUrl){
                  const image=document.createElement('img')
                  image.alt=item.alt||''
                  image.draggable=false
                  setSafeUrlAttribute(image,'src',imageUrl,'media')
                  button.appendChild(image)
                }else button.textContent=item.type==='html'?runtimeContext.t('html','HTML'):runtimeContext.t('video','Video slide')
                button.addEventListener('click',()=>activate(index),{signal:viewSignal})
                thumbs.appendChild(button)
              })
              stage.appendChild(thumbs)
            }
            scheduleAutoplay()
            preloadEditors()
          }

          const moveSlide=(from,to)=>{
            if(readOnly||from===to||to<0||to>=data.slides.length)return
            const activeId=data.slides[activeIndex]?.id
            retainControlFocus(wrapper,()=>context.updateData(current=>{
              const slides=current.slides.map(slide=>({...slide}))
              const [moved]=slides.splice(from,1)
              if(moved)slides.splice(to,0,moved)
              return {...current,slides}
            }))
            queueMicrotask(()=>{
              const index=data.slides.findIndex(slide=>slide.id===activeId)
              if(index>=0)activeIndex=index
            })
          }

          wrapper.addEventListener('dragover',event=>{
            if(readOnly)return
            const files=[...(event.dataTransfer?.files??[])]
            if(files.some(file=>carouselFileType(file))){
              event.preventDefault()
              event.dataTransfer.dropEffect='copy'
            }
          },{signal:context.signal})
          wrapper.addEventListener('drop',event=>{
            if(readOnly)return
            const files=[...(event.dataTransfer?.files??[])].filter(file=>carouselFileType(file))
            if(!files.length)return
            event.preventDefault()
            void resolveFiles(files)
          },{signal:context.signal})

          project()

          return {
            element:wrapper,
            read:()=>({
              slides:data.slides.map(slide=>{
                const field=captionFields.get(slide.id)
                return field?{...slide,caption:field.innerHTML.trim()}:{...slide}
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
              mode:/** @type {'rich-text'} */('rich-text'),
            }))),
            setReadOnly(value){readOnly=value;project()},
            focus(target){
              if(dead||readOnly)return
              const index=data.slides.findIndex(slide=>target?.fieldKey===`slide:${slide.id}:caption`)
              if(index>=0&&index!==activeIndex)activate(index)
              ;(captionFields.get(data.slides[activeIndex]?.id)??wrapper.querySelector('button'))?.focus()
            },
            destroy(){dead=true;viewController?.abort();clearAutoplay();abortTasks();captionFields.clear()},
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
