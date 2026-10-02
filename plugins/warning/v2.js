// @ts-check
import { setSanitizedHtml, setTrustedHtml } from '../../plugin-kit/index.js'
import { warningDataSchema } from '../../shared/blockSchemas/warning.js'

const editorStyles=new URL('./warning.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87l-8.106-13.536a1.914 1.914 0 0 0-3.274 0z"/><path d="M12 16h.01"/></svg>'
const ICON_LARGE='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87l-8.106-13.536a1.914 1.914 0 0 0-3.274 0z"/><path d="M12 16h.01"/></svg>'

function append(left,right){
  if(!left)return right
  if(!right)return left
  return left+'<br>'+right
}

/** @returns {import('../../plugin-kit/types').BlockPluginDefinition<{title:string,message:string}>} */
export function createWarningPlugin(){
  const capabilities=Object.freeze({
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>!data.title.trim()&&!data.message.trim()}),
    merge:Object.freeze({
      merge(target,source){
        return {title:append(target.title,source.title),message:append(target.message,source.message)}
      },
    }),
    conversion:Object.freeze({
      export(data){
        return {kind:'rich-text',data:{text:[data.title,data.message].filter(Boolean).join('<br>')}}
      },
      canImport(payload){
        return payload?.kind==='rich-text'&&typeof payload.data?.text==='string'
      },
      import(payload){
        if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string'){
          throw new TypeError('Warning can only import rich-text payloads')
        }
        return {title:'',message:payload.data.text}
      },
    }),
  })
  return Object.freeze({
    type:'warning',
    label:Object.freeze({key:'title',fallback:'Warning'}),
    icon:ICON,
    styles:Object.freeze([editorStyles]),
    schema:warningDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed) throw new Error('Warning runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-warning'
          wrapper.setAttribute('role','note')
          const icon=document.createElement('div')
          icon.className='oe-warning__icon'
          icon.setAttribute('aria-hidden','true')
          setTrustedHtml(icon,ICON_LARGE)
          const content=document.createElement('div')
          content.className='oe-warning__content'
          const title=document.createElement('div')
          title.className='oe-warning__title'
          title.contentEditable=context.isReadOnly()?'false':'true'
          title.dataset.placeholder=runtimeContext.t('titlePlaceholder','Title')
          if(initial.title)setSanitizedHtml(title,initial.title)
          const message=document.createElement('div')
          message.className='oe-warning__message'
          message.contentEditable=context.isReadOnly()?'false':'true'
          message.dataset.placeholder=runtimeContext.t('messagePlaceholder','Message')
          if(initial.message)setSanitizedHtml(message,initial.message)
          content.append(title,message)
          wrapper.append(icon,content)

          let readOnly=context.isReadOnly()
          let instanceDestroyed=false
          title.addEventListener('keydown',event=>{
            if(readOnly)return
            if((event.key==='Enter'&&!event.shiftKey)||(event.key==='Tab'&&!event.shiftKey)){
              event.preventDefault()
              event.stopPropagation()
              message.focus()
            }
          },{signal:context.signal})
          message.addEventListener('keydown',event=>{
            if(readOnly)return
            if(event.key==='Tab'&&event.shiftKey){
              event.preventDefault()
              event.stopPropagation()
              title.focus()
            }else if(event.key==='Enter'&&!event.shiftKey){
              event.stopPropagation()
            }
          },{signal:context.signal})

          return {
            element:wrapper,
            read:()=>({title:title.innerHTML.trim(),message:message.innerHTML.trim()}),
            update(next){
              if(instanceDestroyed)return
              if(title.innerHTML!==next.title)setSanitizedHtml(title,next.title)
              if(message.innerHTML!==next.message)setSanitizedHtml(message,next.message)
            },
            editableFields:()=>Object.freeze([
              Object.freeze({key:'title',element:title,mode:/** @type {'rich-text'} */('rich-text')}),
              Object.freeze({key:'message',element:message,mode:/** @type {'rich-text'} */('rich-text')}),
            ]),
            setReadOnly(value){
              readOnly=value
              title.contentEditable=value?'false':'true'
              message.contentEditable=value?'false':'true'
            },
            focus(target){
              if(instanceDestroyed||readOnly)return
              ;(target?.fieldKey==='message'?message:title).focus()
            },
            destroy(){instanceDestroyed=true},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
