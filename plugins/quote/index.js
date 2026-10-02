// @ts-check
import { setSanitizedHtml } from '../../plugin-kit/index.js'
import { quoteDataSchema } from '../../shared/blockSchemas/quote.js'

const editorStyles = new URL('./quote.css', import.meta.url).href
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5a2 2 0 0 1 2 2v6c0 3.13 -1.65 5.193 -4.757 5.97a1 1 0 1 1 -.486 -1.94c2.227 -.557 3.243 -1.827 3.243 -4.03v-1h-3a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-3a2 2 0 0 1 2 -2z"/><path d="M18 5a2 2 0 0 1 2 2v6c0 3.13 -1.65 5.193 -4.757 5.97a1 1 0 1 1 -.486 -1.94c2.227 -.557 3.243 -1.827 3.243 -4.03v-1h-3a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-3a2 2 0 0 1 2 -2z"/></svg>'

function mergeField(left, right, separator = '') {
  if (!left) return right
  if (!right) return left
  return left + separator + right
}

/**
 * Create the immutable Quote v2 definition with stable rich-text fields.
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{text:string, caption:string}>}
 */
export function createQuotePlugin() {
  /** @type {import('../../plugin-kit/types').BlockCapabilities<{text:string,caption:string}>} */
  const capabilities=Object.freeze({
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>!data.text.trim()&&!data.caption.trim()}),
    merge:Object.freeze({
      merge(target,source){
        return {
          text:mergeField(target.text,source.text),
          caption:mergeField(target.caption,source.caption,'<br>'),
        }
      },
    }),
    shortcuts:Object.freeze(/** @type {import('../../plugin-kit/types').ShortcutCapability<any>} */ ({
      handle(input){
        if(input.key!=='Tab')return null
        if(!input.shiftKey&&input.fieldKey==='text')return {kind:'focus',target:{fieldKey:'caption',offset:'start'}}
        if(input.shiftKey&&input.fieldKey==='caption')return {kind:'focus',target:{fieldKey:'text',offset:'end'}}
        return null
      },
    })),
    conversion:Object.freeze({
      export(data){
        return {kind:'rich-text',data:{text:[data.text,data.caption].filter(Boolean).join('<br>')}}
      },
      canImport(payload){
        return payload?.kind==='rich-text'&&typeof payload.data?.text==='string'
      },
      import(payload){
        if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string'){
          throw new TypeError('Quote can only import rich-text payloads')
        }
        return {text:payload.data.text,caption:''}
      },
    }),
  })

  return Object.freeze({
    type:'quote',
    label:Object.freeze({key:'title',fallback:'Quote'}),
    icon:ICON,
    styles:Object.freeze([editorStyles]),
    schema:quoteDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed) throw new Error('Quote runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-quote'
          const text=document.createElement('blockquote')
          text.className='oe-quote__text'
          text.contentEditable=context.isReadOnly()?'false':'true'
          text.dataset.placeholder=runtimeContext.t('textPlaceholder','Quote')
          if(initial.text) setSanitizedHtml(text,initial.text)
          const caption=document.createElement('cite')
          caption.className='oe-quote__caption'
          caption.contentEditable=context.isReadOnly()?'false':'true'
          caption.dataset.placeholder=runtimeContext.t('captionPlaceholder','Caption')
          if(initial.caption) setSanitizedHtml(caption,initial.caption)
          wrapper.append(text,caption)

          let readOnly=context.isReadOnly()
          let instanceDestroyed=false

          return {
            element:wrapper,
            read:()=>({text:text.innerHTML.trim(),caption:caption.innerHTML.trim()}),
            update(next){
              if(instanceDestroyed) return
              if(text.innerHTML!==next.text) setSanitizedHtml(text,next.text)
              if(caption.innerHTML!==next.caption) setSanitizedHtml(caption,next.caption)
            },
            editableFields:()=>Object.freeze([
              Object.freeze({key:'text',element:text,mode:/** @type {'rich-text'} */('rich-text')}),
              Object.freeze({key:'caption',element:caption,mode:/** @type {'rich-text'} */('rich-text')}),
            ]),
            setReadOnly(value){
              readOnly=value
              text.contentEditable=value?'false':'true'
              caption.contentEditable=value?'false':'true'
            },
            focus(target){
              if(instanceDestroyed||readOnly) return
              ;(target?.fieldKey==='caption'?caption:text).focus()
            },
            destroy(){instanceDestroyed=true},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
