// @ts-check
import { setSanitizedHtml } from '../../plugin-kit/index.js'
import { headingDataSchema } from '../../shared/blockSchemas/heading.js'
import { acceptsTextPayload, richTextFromPayload } from '../shared/textConversion.js'
import { HEADING_ICON, HEADING_LEVELS, HEADING_STYLES } from './metadata.js'

function levelLabel(level){
  const item=HEADING_LEVELS.find(entry=>entry.level===level)
  return item??HEADING_LEVELS[0]
}

function mergeText(left,right){
  if(!left)return right
  if(!right)return left
  return left+right
}

/**
 * Create the immutable Heading v2 definition with model-first level controls.
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{text:string,level:2|3|4|5|6}>}
 */
export function createHeadingPlugin(){
  const toolbox=Object.freeze(HEADING_LEVELS.map(item=>Object.freeze({
    id:`h${item.level}`,
    label:Object.freeze({key:item.key,fallback:item.fallback}),
    icon:item.icon,
    configure(base){
      return {...base,level:/** @type {2|3|4|5|6} */(item.level)}
    },
  })))

  const levelSettings=Object.freeze({
    label:Object.freeze({key:'level',fallback:'Heading level'}),
    kind:/** @type {'actions'} */('actions'),
    actions(data){
      return HEADING_LEVELS.map(item=>Object.freeze({
        id:`h${item.level}`,
        label:Object.freeze({key:item.key,fallback:item.fallback}),
        icon:item.icon,
        active:data.level===item.level,
      }))
    },
    apply(data,actionId){
      const match=/^h([2-6])$/.exec(actionId)
      if(!match)throw new RangeError(`Unknown heading setting: ${actionId}`)
      return {...data,level:/** @type {2|3|4|5|6} */(Number(match[1]))}
    },
  })

  const capabilities=Object.freeze({
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>data.text.trim().length===0}),
    merge:Object.freeze({
      merge(target,source){
        return {...target,text:mergeText(target.text,source.text)}
      },
    }),
    conversion:Object.freeze({
      selectionMode:'per-block',
      export(data){
        return {kind:'rich-text',data:{text:data.text}}
      },
      canImport(payload){
        return acceptsTextPayload(payload)
      },
      import(payload){
        return {text:richTextFromPayload(payload),level:/** @type {2} */(2)}
      },
    }),
    inlineControls:levelSettings,
    settings:levelSettings,
    htmlImport:Object.freeze({
      matchesRoot(element){
        return /^H[2-6]$/.test(element.tagName)
      },
      importRoot(element,context){
        const level=Number(element.tagName.slice(1))
        return {
          text:context.serializeRichText(element),
          level:/** @type {2|3|4|5|6} */(level),
        }
      },
    }),
  })

  return Object.freeze({
    type:'heading',
    label:Object.freeze({key:'title',fallback:'Heading'}),
    icon:HEADING_ICON,
    styles:HEADING_STYLES,
    toolbox,
    schema:headingDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('Heading runtime is destroyed')
          const document=context.ownerDocument
          const host=document.createElement('div')
          host.className='oe-heading-host'
          let current
          let data={...initial}
          let readOnly=context.isReadOnly()
          let instanceDestroyed=false

          const build=value=>{
            const item=levelLabel(value.level)
            const heading=document.createElement(`h${item.level}`)
            heading.className=`oe-heading oe-heading--h${item.level}`
            heading.contentEditable=readOnly?'false':'true'
            heading.dataset.placeholder=runtimeContext.t('placeholder',item.fallback,{level:item.level})
            if(value.text)setSanitizedHtml(heading,value.text)
            return heading
          }

          current=build(data)
          host.appendChild(current)

          const project=next=>{
            if(instanceDestroyed)return
            if(next.level!==data.level){
              const replacement=build(next)
              current.replaceWith(replacement)
              current=replacement
            }else if(current.innerHTML!==next.text){
              if(next.text)setSanitizedHtml(current,next.text)
              else current.textContent=''
            }
            data={...next}
          }

          return {
            element:host,
            read:()=>({text:current.innerHTML,level:data.level}),
            update:project,
            editableFields:()=>Object.freeze([
              Object.freeze({key:'text',element:current,mode:/** @type {'rich-text'} */('rich-text')}),
            ]),
            setReadOnly(value){
              readOnly=value
              current.contentEditable=value?'false':'true'
            },
            focus(){
              if(!instanceDestroyed&&!readOnly)current.focus()
            },
            destroy(){instanceDestroyed=true},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
