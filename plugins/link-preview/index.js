// @ts-check
import { setSafeUrlAttribute } from '../../plugin-kit/index.js'
import { linkPreviewDataSchema } from '../../shared/blockSchemas/linkPreview.js'
import { LINK_PREVIEW_TEMPLATES } from '../../shared/blockOptions.js'
import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { setTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { TEMPLATE_ICONS } from './templateIcons.js'

const editorStyles=new URL('./link-preview.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6"/><path d="M11 6l.463-.536a5 5 0 0 1 7.071 7.072L18 13"/><path d="M13 18l-.397.534a5.068 5.068 0 0 1-7.127 0 4.972 4.972 0 0 1 0-7.071L6 11"/></svg>'

const TEMPLATE_LABELS=Object.freeze({
  horizontal:'Horizontal',
  compact:'Compact',
  'large-top':'Large top',
  minimal:'Minimal',
  twitter:'Twitter',
  notion:'Notion',
  split:'Split',
})

/**
 * Create an immutable Link Preview block definition with optional asynchronous metadata resolution.
 * @param {{fetchMeta?:(url:string,context:{signal:AbortSignal})=>Promise<{title?:string,description?:string,image?:string,favicon?:string,domain?:string}>,injectStyles?:boolean,css?:string}} [config]
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<any>}
 */
export function createLinkPreviewPlugin(config={}){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Link Preview configuration must be an object')
  const snapshot=Object.freeze({...config})
  const styles=[]
  if(snapshot.injectStyles!==false)styles.push(editorStyles)
  if(snapshot.css)styles.push(snapshot.css)

  const capabilities=Object.freeze({
    empty:Object.freeze({isEmpty:data=>!data.url}),
    conversion:Object.freeze({
      export:data=>({kind:'plain-text',data:{text:data.title||data.url}}),
      canImport:payload=>(payload?.kind==='plain-text'||payload?.kind==='rich-text')&&typeof payload.data?.text==='string',
      import(payload){
        if((payload?.kind!=='plain-text'&&payload?.kind!=='rich-text')||typeof payload.data?.text!=='string'){
          throw new TypeError('Link Preview can only import textual payloads')
        }
        const value=linkPreviewDataSchema.createDefault()
        const url=sanitizeUrl(payload.data.text,{policy:'external',allowRelative:false,fallback:''})
        return {...value,url,domain:host(url)}
      },
    }),
    settings:Object.freeze({
      kind:/** @type {'actions'} */('actions'),
      actions(data){
        return LINK_PREVIEW_TEMPLATES.map(template=>Object.freeze({
          id:template,
          label:Object.freeze({key:'template.'+template,fallback:TEMPLATE_LABELS[template]??template}),
          active:data.template===template,
        }))
      },
      apply(data,actionId){
        if(!LINK_PREVIEW_TEMPLATES.includes(actionId))throw new RangeError('Unknown link-preview template: '+actionId)
        return {...data,template:actionId}
      },
    }),
    paste:Object.freeze({
      accepts(input){return input.kind==='text'&&/^https?:\/\/\S+$/i.test(input.text)},
      resolve(input){
        if(input.kind!=='text')return null
        const url=sanitizeUrl(input.text,{policy:'external',allowRelative:false,fallback:''})
        if(!url)return null
        return {kind:/** @type {'block'} */('block'),data:{...linkPreviewDataSchema.createDefault(),url,domain:host(url)}}
      },
    }),
  })

  return Object.freeze({
    type:'linkPreview',
    label:Object.freeze({key:'title',fallback:'Link Preview'}),
    icon:ICON,
    styles:Object.freeze(styles),
    schema:linkPreviewDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('Link Preview runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-lp'
          wrapper.contentEditable='false'
          wrapper.tabIndex=-1

          const input=document.createElement('input')
          input.type='text'
          input.className='oe-lp__url-input'
          input.setAttribute('data-oe-document-input','value')
          input.placeholder=runtimeContext.t('placeholder','Paste a link...')

          const urlBar=document.createElement('div')
          urlBar.className='oe-lp__url-bar'
          const urlIcon=document.createElement('span')
          urlIcon.className='oe-lp__url-icon'
          const urlFavicon=document.createElement('img')
          urlFavicon.alt=''
          urlIcon.appendChild(urlFavicon)
          urlBar.append(urlIcon,input)
          const card=document.createElement('a')
          card.className='oe-lp__card'
          card.target='_blank'
          card.rel='noopener noreferrer'

          const image=document.createElement('img')
          image.alt=''
          const imageWrap=document.createElement('div')
          imageWrap.className='oe-lp__image'
          imageWrap.appendChild(image)
          const body=document.createElement('div')
          body.className='oe-lp__content'
          const title=document.createElement('div')
          title.className='oe-lp__title'
          const description=document.createElement('div')
          description.className='oe-lp__desc'
          const domain=document.createElement('div')
          domain.className='oe-lp__domain'
          const favicon=document.createElement('img')
          favicon.className='oe-lp__favicon'
          favicon.alt=''
          domain.appendChild(favicon)
          const domainText=document.createElement('span')
          domain.appendChild(domainText)
          const largeFavicon=document.createElement('img')
          largeFavicon.className='oe-lp__favicon-large'
          largeFavicon.alt=''
          body.append(title,description,domain)
          card.append(largeFavicon,body,imageWrap)
          const actions=document.createElement('div')
          actions.className='oe-lp__actions'
          const dropdown=document.createElement('div')
          dropdown.className='oe-lp__dropdown'
          const settings=document.createElement('button')
          settings.type='button'
          settings.className='oe-lp__action-btn'
          settings.textContent=runtimeContext.t('settings','Settings')
          settings.setAttribute('aria-expanded','false')
          const panel=document.createElement('div')
          panel.className='oe-lp__dropdown-panel'
          panel.setAttribute('role','group')
          panel.setAttribute('aria-label',runtimeContext.t('template','Template'))
          panel.style.top='100%'
          const templateGrid=document.createElement('div')
          templateGrid.className='oe-lp__tpl-grid'
          const templateButtons=new Map()
          for(const template of LINK_PREVIEW_TEMPLATES){
            const button=document.createElement('button')
            button.type='button'
            button.className='oe-lp__tpl-btn'
            const templateKey='template.'+template
            button.title=runtimeContext.t(templateKey,TEMPLATE_LABELS[template])
            button.setAttribute('aria-label',button.title)
            setTrustedHtml(button,TEMPLATE_ICONS[template])
            button.dataset.template=template
            button.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
            button.addEventListener('click',()=>{
              if(readOnly||dead)return
              context.updateData(current=>({...current,template}))
              input.focus()
            },{signal:context.signal})
            templateButtons.set(template,button)
            templateGrid.appendChild(button)
          }
          panel.appendChild(templateGrid)
          dropdown.append(settings,panel)
          const remove=document.createElement('button')
          remove.type='button'
          remove.className='oe-lp__action-btn oe-lp__action-btn--danger'
          remove.textContent=runtimeContext.t('delete','Delete')
          actions.append(dropdown,remove)
          wrapper.append(urlBar,card,actions)

          let data={...initial}
          let readOnly=context.isReadOnly()
          let dead=false
          let currentTask=null
          let generation=0
          let inputTimer=null
          const timerHost=document.defaultView??globalThis
          const clearInputTimer=()=>{
            if(inputTimer!==null)timerHost.clearTimeout(inputTimer)
            inputTimer=null
          }

          const project=next=>{
            clearInputTimer()
            data={...next}
            input.value=data.url
            input.readOnly=readOnly
            wrapper.dataset.template=data.template
            const filled=!!data.url
            wrapper.classList.toggle('oe-lp--filled',filled)
            card.hidden=!filled
            actions.hidden=readOnly||!filled
            urlBar.hidden=false
            card.className='oe-lp__card oe-lp__card--'+data.template
            for(const [template,button] of templateButtons){
              button.classList.toggle('oe-lp__tpl-btn--active',template===data.template)
              button.setAttribute('aria-pressed',String(template===data.template))
            }
            if(filled)setSafeUrlAttribute(card,'href',data.url,'external')
            else card.removeAttribute('href')
            title.textContent=data.title||data.url
            description.textContent=data.description
            domainText.textContent=data.domain||host(data.url)
            for(const element of [favicon,largeFavicon,urlFavicon]){
              element.hidden=!data.favicon
              if(data.favicon)setSafeUrlAttribute(element,'src',data.favicon,'media')
              else element.removeAttribute('src')
            }
            largeFavicon.hidden=!data.favicon||data.template!=='notion'
            favicon.hidden=!data.favicon||data.template==='notion'
            if(data.image){
              imageWrap.hidden=['minimal','notion'].includes(data.template)
              setSafeUrlAttribute(image,'src',data.image,'media')
            }else{
              imageWrap.hidden=true
              image.removeAttribute('src')
            }
          }

          const resolveMeta=async url=>{
            currentTask?.cancel()
            if(!snapshot.fetchMeta||!url||readOnly||dead)return
            const task=context.beginTask()
            currentTask=task
            const current=++generation
            try{
              const result=await snapshot.fetchMeta(url,{signal:task.signal})
              if(dead||task.signal.aborted||current!==generation)return
              const meta=result&&typeof result==='object'?result:{}
              task.commit(previous=>previous.url===url?({
                ...previous,
                title:typeof meta.title==='string'?meta.title:previous.title,
                description:typeof meta.description==='string'?meta.description:previous.description,
                image:typeof meta.image==='string'?meta.image:previous.image,
                favicon:typeof meta.favicon==='string'?meta.favicon:previous.favicon,
                domain:typeof meta.domain==='string'?meta.domain:previous.domain||host(url),
              }):previous)
            }catch(error){
              if(!task.signal.aborted)console.warn('[LinkPreview] Metadata resolution failed',error)
            }finally{
              task.cancel()
              if(currentTask===task)currentTask=null
            }
          }

          const commitUrl=()=>{
            clearInputTimer()
            if(readOnly||dead)return
            const url=sanitizeUrl(input.value,{policy:'external',allowRelative:false,fallback:''})
            context.updateData(current=>url?{...(url===current.url?current:{...linkPreviewDataSchema.createDefault(),template:current.template}),url,domain:host(url)}:{...linkPreviewDataSchema.createDefault(),template:current.template})
            if(url)void resolveMeta(url)
          }

          const setOpen=open=>{
            dropdown.classList.toggle('oe-lp__dropdown--open',open)
            settings.setAttribute('aria-expanded',String(open))
          }
          settings.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
          settings.addEventListener('click',()=>{if(!readOnly)setOpen(settings.getAttribute('aria-expanded')!=='true')},{signal:context.signal})
          document.addEventListener('click',event=>{if(!dropdown.contains(event.target))setOpen(false)},{signal:context.signal})
          dropdown.addEventListener('keydown',event=>{
            if(event.key==='Escape'){
              event.preventDefault();event.stopPropagation();setOpen(false);settings.focus()
            }
          },{signal:context.signal})
          remove.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
          remove.addEventListener('click',()=>{
            if(readOnly||dead)return
            clearInputTimer()
            currentTask?.cancel()
            currentTask=null
            ++generation
            setOpen(false)
            context.updateData(()=>linkPreviewDataSchema.createDefault())
            input.focus()
          },{signal:context.signal})

          input.addEventListener('keydown',event=>{
            if(event.key==='Enter'){
              event.preventDefault()
              event.stopPropagation()
              commitUrl()
            }else if(!event.ctrlKey&&!event.metaKey){
              event.stopPropagation()
            }
          },{signal:context.signal})
          input.addEventListener('change',commitUrl,{signal:context.signal})
          input.addEventListener('input',()=>{
            clearInputTimer()
            if(readOnly||dead)return
            inputTimer=timerHost.setTimeout(commitUrl,500)
          },{signal:context.signal})

          project(data)
          if(data.url&&!data.title&&!data.image&&!data.favicon){
            queueMicrotask(()=>{if(!dead&&!readOnly)void resolveMeta(data.url)})
          }

          return {
            element:wrapper,
            read:()=>{
              const url=input.value.trim()?sanitizeUrl(input.value,{policy:'external',allowRelative:false,fallback:data.url}):''
              return url===data.url?{...data}:{...linkPreviewDataSchema.createDefault(),template:data.template,url,domain:host(url)}
            },
            update(next){if(!dead)project(next)},
            editableFields:()=>Object.freeze([Object.freeze({key:'url',element:input,mode:/** @type {'plain-text'} */('plain-text')})]),
            setReadOnly(value){readOnly=value;project(data)},
            focus(){if(!dead&&!readOnly)input.focus()},
            destroy(){dead=true;clearInputTimer();currentTask?.cancel();currentTask=null},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}

function host(url){
  try{return url?new URL(url).hostname:''}catch{return ''}
}
