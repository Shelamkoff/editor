// @ts-check
import { setSanitizedHtml } from '../../plugin-kit/index.js'
import { columnsDataSchema } from '../../shared/blockSchemas/columns.js'
import { acceptsTextPayload, richTextFromPayload } from '../shared/textConversion.js'
import { createTextSelectionSlice } from '../shared/textSelectionSlice.js'
import {
  COLUMNS_ICON,
  COLUMNS_STYLES,
  COLUMN_LAYOUT_ICONS,
  COLUMN_LAYOUT_KEYS,
  COLUMN_LAYOUTS,
} from './metadata.js'

function fitColumns(columns,size,context){
  const kept=columns.slice(0,size).map(column=>({...column}))
  while(kept.length<size){
    kept.push({id:context.createId('column'),content:''})
  }
  const last=kept[size-1]
  for(const column of columns.slice(size)){
    if(!column.content.trim())continue
    last.content=last.content?last.content+'<br>'+column.content:column.content
  }
  return kept
}

/**
 * Create the immutable Columns v2 definition with stable column identities.
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{layout:string,columns:Array<{id:string,content:string}>}>}
 */
export function createColumnsPlugin(){
  /** @type {import('../../plugin-kit/types').BlockCapabilities<{layout:string,columns:Array<{id:string,content:string}>}>} */
  const capabilities=Object.freeze({
    selectionSlice:createTextSelectionSlice(columnsDataSchema),
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>data.columns.every(column=>column.content.trim().length===0)}),
    shortcuts:Object.freeze(/** @type {import('../../plugin-kit/types').ShortcutCapability<any>} */ ({
      handle(input){
        if(input.fieldKey.startsWith('column:')&&['Enter','Backspace','Delete'].includes(input.key))return {kind:'native'}
        return null
      },
    })),
    conversion:Object.freeze({
      selectionMode:'single',
      export(data){
        return {kind:'rich-text',data:{text:data.columns.map(column=>column.content).filter(Boolean).join('<br>')}}
      },
      canImport(payload){
        return acceptsTextPayload(payload)
      },
      import(payload){
        return {
          layout:'1-1',
          columns:[
            {id:'column-0',content:richTextFromPayload(payload)},
            {id:'column-1',content:''},
          ],
        }
      },
    }),
    clipboard:Object.freeze({
      slice(data,context){
        let any=false
        const selected=data.columns.map(column=>{
          const field=context.field(`column:${column.id}`)
          if(field)any=true
          return {...column,content:field?.selected??''}
        })
        if(!any)throw new Error('Columns clipboard selection is empty')
        const remaining=data.columns.map(column=>{
          const field=context.field(`column:${column.id}`)
          return field?{...column,content:field.before+field.after}:{...column}
        })
        return {
          parts:[{kind:/** @type {'local-block'} */ ('local-block'),data:{layout:data.layout,columns:selected}}],
          remaining:{layout:data.layout,columns:remaining},
          focus:null,
        }
      },
    }),
    settings:Object.freeze({
      kind:/** @type {'actions'} */('actions'),
      actions(data){
        return COLUMN_LAYOUT_KEYS.map(key=>Object.freeze({
          id:key,
          label:Object.freeze({key:`layout.${key}`,fallback:COLUMN_LAYOUTS[key].label}),
          icon:COLUMN_LAYOUT_ICONS[key],
          active:data.layout===key,
        }))
      },
      apply(data,actionId,context){
        if(!Object.hasOwn(COLUMN_LAYOUTS,actionId))throw new RangeError(`Unknown columns layout: ${actionId}`)
        return {
          layout:actionId,
          columns:fitColumns(data.columns,COLUMN_LAYOUTS[actionId].cols,context),
        }
      },
    }),
  })

  return Object.freeze({
    type:'columns',
    label:Object.freeze({key:'title',fallback:'Columns'}),
    icon:COLUMNS_ICON,
    styles:COLUMNS_STYLES,
    schema:columnsDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('Columns runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-columns'
          wrapper.contentEditable='false'
          wrapper.tabIndex=-1
          const grid=document.createElement('div')
          grid.className='oe-columns__grid'
          wrapper.appendChild(grid)

          let data={layout:initial.layout,columns:initial.columns.map(column=>({...column}))}
          let readOnly=context.isReadOnly()
          let instanceDestroyed=false
          const nodes=new Map()

          const createColumn=column=>{
            const element=document.createElement('div')
            element.className='oe-columns__col'
            element.dataset.columnId=column.id
            element.contentEditable=readOnly?'false':'true'
            if(column.content)setSanitizedHtml(element,column.content)
            nodes.set(column.id,element)
            return element
          }

          const reconcile=next=>{
            const layout=COLUMN_LAYOUTS[next.layout]??COLUMN_LAYOUTS['1-1']
            grid.style.gridTemplateColumns=layout.grid
            const live=new Set()
            next.columns.forEach((column,index)=>{
              live.add(column.id)
              const element=nodes.get(column.id)??createColumn(column)
              element.contentEditable=readOnly?'false':'true'
              element.dataset.placeholder=`${runtimeContext.t('colPlaceholder','Column')} ${index+1}`
              if(element.innerHTML!==column.content){
                if(column.content)setSanitizedHtml(element,column.content)
                else element.textContent=''
              }
              grid.appendChild(element)
            })
            for(const [id,node] of nodes){
              if(live.has(id))continue
              node.remove()
              nodes.delete(id)
            }
            data={layout:next.layout,columns:next.columns.map(column=>({...column}))}
          }

          reconcile(data)

          return {
            element:wrapper,
            read:()=>({
              layout:data.layout,
              columns:data.columns.map(column=>({
                id:column.id,
                content:nodes.get(column.id)?.innerHTML.trim()??column.content,
              })),
            }),
            update(next){if(!instanceDestroyed)reconcile(next)},
            editableFields:()=>Object.freeze(data.columns.flatMap(column=>{
              const element=nodes.get(column.id)
              return element?[Object.freeze({
                key:`column:${column.id}`,
                element,
                mode:/** @type {'rich-text'} */('rich-text'),
              })]:[]
            })),
            setReadOnly(value){
              readOnly=value
              for(const node of nodes.values())node.contentEditable=value?'false':'true'
            },
            focus(target){
              if(instanceDestroyed||readOnly)return
              const key=target?.fieldKey
              const id=key?.startsWith('column:')?key.slice(7):data.columns[0]?.id
              nodes.get(id)?.focus()
            },
            destroy(){instanceDestroyed=true;nodes.clear()},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
