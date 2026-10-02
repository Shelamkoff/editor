// @ts-check
import {
  READ_ONLY_INTERACTIVE_ATTRIBUTE,
  setSanitizedHtml,
  setTrustedHtml,
} from '../../plugin-kit/index.js'
import { toggleDataSchema } from '../../shared/blockSchemas/toggle.js'

const editorStyles=new URL('./toggle.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v-3a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3"/><path d="M20 12v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3"/></svg>'
const ICON_CHEVRON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg>'
let sequence=0

function append(left,right){
  if(!left)return right
  if(!right)return left
  return left+'<br>'+right
}

/**
 * Create the immutable Toggle v2 definition with model-owned open state.
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{title:string,content:string,open:boolean}>}
 */
export function createTogglePlugin(){
  const capabilities=Object.freeze({
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>!data.title.trim()&&!data.content.trim()}),
    merge:Object.freeze({
      merge(target,source){
        return {
          title:append(target.title,source.title),
          content:append(target.content,source.content),
          open:target.open||source.open,
        }
      },
    }),
    shortcuts:Object.freeze({
      handle(input,data){
        if(input.fieldKey==='title'&&input.key==='Enter'&&!input.shiftKey){
          return {kind:'update',data:{...data,open:true},focus:{fieldKey:'content',offset:'start'}}
        }
        if(input.fieldKey==='content'&&input.key==='Enter'&&!input.shiftKey)return {kind:'native'}
        return null
      },
    }),
    conversion:Object.freeze({
      export(data){
        return {kind:'rich-text',data:{text:[data.title,data.content].filter(Boolean).join('<br>')}}
      },
      canImport(payload){
        return payload?.kind==='rich-text'&&typeof payload.data?.text==='string'
      },
      import(payload){
        if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string'){
          throw new TypeError('Toggle can only import rich-text payloads')
        }
        return {title:'',content:payload.data.text,open:true}
      },
    }),
  })

  return Object.freeze({
    type:'toggle',
    label:Object.freeze({key:'title',fallback:'Toggle'}),
    icon:ICON,
    styles:Object.freeze([editorStyles]),
    schema:toggleDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('Toggle runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-toggle'
          const header=document.createElement('div')
          header.className='oe-toggle__header'
          const chevron=document.createElement('button')
          chevron.type='button'
          chevron.className='oe-toggle__chevron'
          setTrustedHtml(chevron,ICON_CHEVRON)
          chevron.setAttribute('aria-label',runtimeContext.t('toggleLabel','Show or hide content'))
          chevron.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE,'')
          const title=document.createElement('div')
          title.className='oe-toggle__title'
          title.dataset.placeholder=runtimeContext.t('titlePlaceholder','Toggle title...')
          if(initial.title)setSanitizedHtml(title,initial.title)
          const body=document.createElement('div')
          body.className='oe-toggle__body'
          body.id=`oe-toggle-body-${++sequence}`
          body.dataset.placeholder=runtimeContext.t('bodyPlaceholder','Hidden content...')
          if(initial.content)setSanitizedHtml(body,initial.content)
          chevron.setAttribute('aria-controls',body.id)
          header.append(chevron,title)
          wrapper.append(header,body)

          let readOnly=context.isReadOnly()
          let persistedOpen=initial.open
          let viewOpen=initial.open
          let instanceDestroyed=false

          const projectOpen=value=>{
            viewOpen=value
            wrapper.classList.toggle('oe-toggle--open',value)
            chevron.setAttribute('aria-expanded',String(value))
          }
          const commitOpen=value=>{
            if(readOnly){
              projectOpen(value)
              return
            }
            context.updateData(current=>({...current,open:value}))
            persistedOpen=value
            projectOpen(value)
          }
          const applyReadOnly=value=>{
            readOnly=value
            title.contentEditable=value?'false':'true'
            body.contentEditable=value?'false':'true'
            projectOpen(value?persistedOpen:viewOpen)
          }

          chevron.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
          chevron.addEventListener('click',event=>{
            event.stopPropagation()
            if(instanceDestroyed)return
            commitOpen(!viewOpen)
          },{signal:context.signal})

          applyReadOnly(readOnly)

          return {
            element:wrapper,
            read:()=>({
              title:title.innerHTML.trim(),
              content:body.innerHTML.trim(),
              open:persistedOpen,
            }),
            update(next){
              if(instanceDestroyed)return
              if(title.innerHTML!==next.title)setSanitizedHtml(title,next.title)
              if(body.innerHTML!==next.content)setSanitizedHtml(body,next.content)
              persistedOpen=next.open
              projectOpen(next.open)
            },
            editableFields:()=>Object.freeze([
              Object.freeze({key:'title',element:title,mode:/** @type {'rich-text'} */('rich-text')}),
              Object.freeze({key:'content',element:body,mode:/** @type {'rich-text'} */('rich-text')}),
            ]),
            setReadOnly:applyReadOnly,
            focus(target){
              if(instanceDestroyed||readOnly)return
              ;(target?.fieldKey==='content'?body:title).focus()
            },
            destroy(){instanceDestroyed=true},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
