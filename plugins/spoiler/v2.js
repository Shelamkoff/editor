// @ts-check
import {
  READ_ONLY_INTERACTIVE_ATTRIBUTE,
  setSanitizedHtml,
  setTrustedHtml,
} from '../../plugin-kit/index.js'
import { spoilerDataSchema } from '../../shared/blockSchemas/spoiler.js'

const editorStyles=new URL('./spoiler.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828"/><path d="M16.681 16.673a8.717 8.717 0 0 1-4.681 1.327c-3.6 0-6.6-2-9-6 1.272-2.12 2.712-3.678 4.32-4.674m2.86-1.146a9.055 9.055 0 0 1 1.82-.18c3.6 0 6.6 2 9 6-.666 1.11-1.379 2.067-2.138 2.87"/><path d="M3 3l18 18"/></svg>'
let sequence=0

function append(left,right){
  if(!left)return right
  if(!right)return left
  return left+'<br>'+right
}

/** @returns {import('../../plugin-kit/types').BlockPluginDefinition<{label:string,content:string}>} */
export function createSpoilerPlugin(){
  const capabilities=Object.freeze({
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>!data.label.trim()&&!data.content.trim()}),
    merge:Object.freeze({
      merge(target,source){
        return {label:append(target.label,source.label),content:append(target.content,source.content)}
      },
    }),
    conversion:Object.freeze({
      export(data){
        return {kind:'rich-text',data:{text:[data.label,data.content].filter(Boolean).join('<br>')}}
      },
      canImport(payload){
        return payload?.kind==='rich-text'&&typeof payload.data?.text==='string'
      },
      import(payload){
        if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string'){
          throw new TypeError('Spoiler can only import rich-text payloads')
        }
        return {label:'',content:payload.data.text}
      },
    }),
  })
  return Object.freeze({
    type:'spoiler',
    label:Object.freeze({key:'title',fallback:'Spoiler'}),
    icon:ICON,
    styles:Object.freeze([editorStyles]),
    schema:spoilerDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('Spoiler runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-spoiler'
          const label=document.createElement('div')
          label.className='oe-spoiler__label'
          label.dataset.placeholder=runtimeContext.t('labelPlaceholder','Spoiler label...')
          if(initial.label)setSanitizedHtml(label,initial.label)
          const toggle=document.createElement('button')
          toggle.type='button'
          toggle.className='oe-spoiler__toggle'
          setTrustedHtml(toggle,ICON)
          toggle.setAttribute('aria-label',runtimeContext.t('toggle','Toggle spoiler'))
          toggle.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE,'')
          const header=document.createElement('div')
          header.className='oe-spoiler__header'
          header.append(toggle,label)
          const content=document.createElement('div')
          content.className='oe-spoiler__content'
          content.id=`oe-spoiler-content-${++sequence}`
          content.dataset.placeholder=runtimeContext.t('contentPlaceholder','Hidden content...')
          if(initial.content)setSanitizedHtml(content,initial.content)
          toggle.setAttribute('aria-controls',content.id)
          wrapper.append(header,content)

          let readOnly=context.isReadOnly()
          let open=!readOnly
          let instanceDestroyed=false

          const projectOpen=value=>{
            open=value
            wrapper.classList.toggle('oe-spoiler--open',value)
            toggle.setAttribute('aria-expanded',String(value))
            content.hidden=!value
          }
          const applyReadOnly=value=>{
            readOnly=value
            label.contentEditable=value?'false':'true'
            content.contentEditable=value?'false':'true'
            projectOpen(!value)
          }

          toggle.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
          toggle.addEventListener('click',event=>{
            event.stopPropagation()
            if(!instanceDestroyed)projectOpen(!open)
          },{signal:context.signal})
          label.addEventListener('keydown',event=>{
            if(readOnly||instanceDestroyed)return
            if(event.key==='Enter'&&!event.shiftKey){
              event.preventDefault()
              event.stopPropagation()
              projectOpen(true)
              content.focus()
            }
          },{signal:context.signal})
          content.addEventListener('keydown',event=>{
            if(!readOnly&&event.key==='Enter'&&!event.shiftKey)event.stopPropagation()
          },{signal:context.signal})

          applyReadOnly(readOnly)

          return {
            element:wrapper,
            read:()=>({label:label.innerHTML.trim(),content:content.innerHTML.trim()}),
            update(next){
              if(instanceDestroyed)return
              if(label.innerHTML!==next.label)setSanitizedHtml(label,next.label)
              if(content.innerHTML!==next.content)setSanitizedHtml(content,next.content)
            },
            editableFields:()=>Object.freeze([
              Object.freeze({key:'label',element:label,mode:/** @type {'rich-text'} */('rich-text')}),
              Object.freeze({key:'content',element:content,mode:/** @type {'rich-text'} */('rich-text')}),
            ]),
            setReadOnly:applyReadOnly,
            focus(target){
              if(instanceDestroyed||readOnly)return
              ;(target?.fieldKey==='content'?content:label).focus()
            },
            destroy(){instanceDestroyed=true},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
