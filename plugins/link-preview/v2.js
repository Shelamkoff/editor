// @ts-check
import { setSafeUrlAttribute } from '../../plugin-kit/index.js'
import { linkPreviewDataSchema } from '../../shared/blockSchemas/linkPreview.js'
import { LINK_PREVIEW_TEMPLATES } from '../../shared/blockOptions.js'
import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'

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

          const card=document.createElement('a')
          card.className='oe-lp__card'
          card.target='_blank'
          card.rel='noopener noreferrer'

          const image=document.createElement('img')
          image.className='oe-lp__image'
          image.alt=''
          const body=document.createElement('div')
          body.className='oe-lp__body'
          const title=document.createElement('div')
          title.className='oe-lp__title'
          const description=document.createElement('div')
          description.className='oe-lp__description'
          const domain=document.createElement('div')
          domain.className='oe-lp__domain'
          body.append(title,description,domain)
          card.append(image,body)
          wrapper.append(input,card)

          let data={...initial}
          let readOnly=context.isReadOnly()
          let dead=false
          let requestController=null
          let generation=0

          const project=next=>{
            data={...next}
            input.value=data.url
            input.readOnly=readOnly
            wrapper.dataset.template=data.template
            const filled=!!data.url
            wrapper.classList.toggle('oe-lp--filled',filled)
            card.hidden=!filled
            if(filled)setSafeUrlAttribute(card,'href',data.url,'external')
            else card.removeAttribute('href')
            title.textContent=data.title||data.url
            description.textContent=data.description
            domain.textContent=data.domain||host(data.url)
            if(data.image){
              image.hidden=false
              setSafeUrlAttribute(image,'src',data.image,'media')
            }else{
              image.hidden=true
              image.removeAttribute('src')
            }
          }

          const resolveMeta=async url=>{
            requestController?.abort()
            if(!snapshot.fetchMeta||!url||readOnly||dead)return
            const Ctor=document.defaultView?.AbortController??AbortController
            const controller=new Ctor()
            requestController=controller
            const current=++generation
            const abort=()=>controller.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:controller.signal})
            try{
              const result=await snapshot.fetchMeta(url,{signal:controller.signal})
              if(dead||controller.signal.aborted||current!==generation)return
              const meta=result&&typeof result==='object'?result:{}
              context.updateData(previous=>({
                ...previous,
                url,
                title:typeof meta.title==='string'?meta.title:previous.title,
                description:typeof meta.description==='string'?meta.description:previous.description,
                image:typeof meta.image==='string'?meta.image:previous.image,
                favicon:typeof meta.favicon==='string'?meta.favicon:previous.favicon,
                domain:typeof meta.domain==='string'?meta.domain:previous.domain||host(url),
              }))
            }catch(error){
              if(!controller.signal.aborted)console.warn('[LinkPreview] Metadata resolution failed',error)
            }
          }

          const commitUrl=()=>{
            if(readOnly||dead)return
            const url=sanitizeUrl(input.value,{policy:'external',allowRelative:false,fallback:''})
            const next=url?{...data,url,domain:host(url)}:{...linkPreviewDataSchema.createDefault(),template:data.template}
            context.updateData(()=>next)
            if(url)void resolveMeta(url)
          }

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

          project(data)
          if(data.url&&!data.title&&!data.image&&!data.favicon)void resolveMeta(data.url)

          return {
            element:wrapper,
            read:()=>({...data,url:input.value.trim()}),
            update(next){if(!dead)project(next)},
            editableFields:()=>Object.freeze([Object.freeze({key:'url',element:input,mode:/** @type {'plain-text'} */('plain-text')})]),
            setReadOnly(value){readOnly=value;project(data);if(value)requestController?.abort()},
            focus(){if(!dead&&!readOnly)input.focus()},
            destroy(){dead=true;requestController?.abort()},
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
