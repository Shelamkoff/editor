// @ts-check
import {
  READ_ONLY_INTERACTIVE_ATTRIBUTE,
  setSanitizedHtml,
} from '../../plugin-kit/index.js'
import { setTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { spoilerDataSchema } from '../../shared/blockSchemas/spoiler.js'
import { acceptsTextPayload, richTextFromPayload } from '../shared/textConversion.js'
import { createTextSelectionSlice } from '../shared/textSelectionSlice.js'

const editorStyles=new URL('./spoiler.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828"/><path d="M16.681 16.673a8.717 8.717 0 0 1-4.681 1.327c-3.6 0-6.6-2-9-6 1.272-2.12 2.712-3.678 4.32-4.674m2.86-1.146a9.055 9.055 0 0 1 1.82-.18c3.6 0 6.6 2 9 6-.666 1.11-1.379 2.067-2.138 2.87"/><path d="M3 3l18 18"/></svg>'
let sequence=0

function append(left,right){
  if(!left)return right
  if(!right)return left
  return left+'<br>'+right
}

/**
 * Create the immutable Spoiler v2 definition with transient disclosure state.
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{label:string,content:string}>}
 */
export function createSpoilerPlugin(){
  /** @type {import('../../plugin-kit/types').BlockCapabilities<{label:string,content:string}>} */
  const capabilities=Object.freeze({
    selectionSlice:createTextSelectionSlice(spoilerDataSchema),
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>!data.label.trim()&&!data.content.trim()}),
    merge:Object.freeze({
      merge(target,source){
        return {label:append(target.label,source.label),content:append(target.content,source.content)}
      },
    }),
    shortcuts:Object.freeze(/** @type {import('../../plugin-kit/types').ShortcutCapability<any>} */ ({
      handle(input){
        if(input.fieldKey==='label'&&input.key==='Enter'&&!input.shiftKey){
          return {kind:'focus',target:{fieldKey:'content',offset:'start'}}
        }
        if(input.fieldKey==='content'&&input.key==='Enter'&&!input.shiftKey)return {kind:'native'}
        return null
      },
    })),
    conversion:Object.freeze({
      export(data){
        return {kind:'rich-text',data:{text:[data.label,data.content].filter(Boolean).join('<br>')}}
      },
      canImport(payload){
        return acceptsTextPayload(payload)
      },
      import(payload){
        return {label:'',content:richTextFromPayload(payload)}
      },
    }),
    clipboard:Object.freeze({
      slice(data,context){
        const label=context.field('label')
        const content=context.field('content')
        if(!label&&!content)throw new Error('Spoiler clipboard selection does not intersect a field')
        const selected={label:label?.selected??'',content:content?.selected??''}
        const remaining={
          label:label?label.before+label.after:data.label,
          content:content?content.before+content.after:data.content,
        }
        return {
          parts:[{kind:/** @type {'local-block'} */ ('local-block'),data:selected}],
          remaining:(!remaining.label.trim()&&!remaining.content.trim())?null:remaining,
          focus:null,
        }
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
              if(target?.fieldKey==='content')projectOpen(true)
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
