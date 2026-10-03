// @ts-check
import { setSanitizedHtml } from '../../plugin-kit/index.js'
import { setTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { checklistDataSchema } from '../../shared/blockSchemas/checklist.js'

const editorStyles=new URL('./checklist.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5l1.5 1.5l2.5-2.5"/><path d="M3.5 11.5l1.5 1.5l2.5-2.5"/><path d="M3.5 17.5l1.5 1.5l2.5-2.5"/><path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/></svg>'
const CHECK_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

function fragmentHtml(range,root){
  const container=root.ownerDocument.createElement('div')
  container.appendChild(range.cloneContents())
  return container.innerHTML
}

function splitAtCaret(field,range){
  const document=field.ownerDocument
  const before=document.createRange()
  before.selectNodeContents(field)
  before.setEnd(range.startContainer,range.startOffset)
  const after=document.createRange()
  after.selectNodeContents(field)
  after.setStart(range.startContainer,range.startOffset)
  return {before:fragmentHtml(before,field),after:fragmentHtml(after,field)}
}

function caretAtStart(field,range){
  const before=field.ownerDocument.createRange()
  before.selectNodeContents(field)
  before.setEnd(range.startContainer,range.startOffset)
  return before.toString().length===0&&before.cloneContents().childNodes.length===0
}

/**
 * Create the immutable Checklist v2 definition with stable item identities.
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{items:Array<{id:string,text:string,checked:boolean}>}>}
 */
export function createChecklistPlugin(){
  /** @type {import('../../plugin-kit/types').BlockCapabilities<{items:Array<{id:string,text:string,checked:boolean}>}>} */
  const capabilities=Object.freeze({
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>data.items.every(item=>item.text.trim().length===0)}),
    merge:Object.freeze({
      merge(target,source){
        const occupied=new Set(target.items.map(item=>item.id))
        const extra=source.items.map((item,index)=>{
          let id=item.id
          let suffix=0
          while(occupied.has(id))id=`merged-${index}-${suffix++}-${item.id}`
          occupied.add(id)
          return {...item,id}
        })
        return {items:[...target.items,...extra]}
      },
    }),
    shortcuts:Object.freeze(/** @type {import('../../plugin-kit/types').ShortcutCapability<any>} */ ({
      handle(input,data,context){
        const id=input.fieldKey.startsWith('item:')?input.fieldKey.slice(5):''
        const index=data.items.findIndex(item=>item.id===id)
        if(index<0)return null
        if(input.key==='Enter'&&!input.shiftKey){
          const current=data.items[index]
          if(!current.text.trim()){
            if(data.items.length===1)return {kind:'exit'}
            const next=data.items[index-1]??data.items[index+1]
            return {
              kind:'update',
              data:{items:data.items.filter(item=>item.id!==id)},
              ...(next?{focus:{fieldKey:`item:${next.id}`,offset:'end'}}:{}),
            }
          }
          const parts=context.splitField(input.fieldKey,input.selection)
          if(!parts)return null
          const newId=context.createId('item')
          const items=data.items.map(item=>item.id===id?{...item,text:parts.before}:item)
          items.splice(index+1,0,{id:newId,text:parts.after,checked:false})
          return {kind:'update',data:{items},focus:{fieldKey:`item:${newId}`,offset:'start'}}
        }
        if(input.key==='Backspace'&&input.selection.start===0&&input.selection.end===0&&index>0){
          const previous=data.items[index-1]
          const items=data.items.map(item=>({...item}))
          items[index-1].text+=items[index].text
          items.splice(index,1)
          return {kind:'update',data:{items},focus:{fieldKey:`item:${previous.id}`,offset:'end'}}
        }
        return null
      },
    })),
    clipboard:Object.freeze({
      slice(data,context){
        const selected=[]
        const remaining=[]
        for(const item of data.items){
          const field=context.field(`item:${item.id}`)
          if(!field){
            remaining.push({...item})
            continue
          }
          if(field.whole||field.selected){
            selected.push({...item,text:field.selected})
          }
          const text=field.before+field.after
          if(text)remaining.push({...item,text})
        }
        if(!selected.length)throw new Error('Checklist clipboard selection is empty')
        if(!remaining.length)remaining.push({id:context.createId('item'),text:'',checked:false})
        return {
          parts:[{kind:'local-block',data:{items:selected}}],
          remaining:{items:remaining},
          focus:null,
        }
      },
    }),
    conversion:Object.freeze({
      export(data){
        return {kind:'rich-text',data:{text:data.items.map(item=>item.text).join('<br>')}}
      },
      canImport(payload){
        return payload?.kind==='rich-text'&&typeof payload.data?.text==='string'
      },
      import(payload){
        if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string'){
          throw new TypeError('Checklist can only import rich-text payloads')
        }
        return {items:[{id:'item-0',text:payload.data.text,checked:false}]}
      },
    }),
  })

  return Object.freeze({
    type:'checklist',
    label:Object.freeze({key:'title',fallback:'Checklist'}),
    icon:ICON,
    styles:Object.freeze([editorStyles]),
    schema:checklistDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('Checklist runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-checklist'
          let data={items:initial.items.map(item=>({...item}))}
          let readOnly=context.isReadOnly()
          let instanceDestroyed=false
          const rows=new Map()

          const createRow=item=>{
            const row=document.createElement('div')
            row.className='oe-checklist__item'
            row.dataset.itemId=item.id
            const checkbox=document.createElement('button')
            checkbox.type='button'
            checkbox.className='oe-checklist__checkbox'
            checkbox.setAttribute('aria-label',runtimeContext.t('toggle','Toggle checklist item'))
            setTrustedHtml(checkbox,CHECK_SVG)
            const text=document.createElement('div')
            text.className='oe-checklist__text'
            text.contentEditable=readOnly?'false':'true'
            if(item.text)setSanitizedHtml(text,item.text)
            row.append(checkbox,text)

            checkbox.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
            checkbox.addEventListener('click',event=>{
              event.stopPropagation()
              if(readOnly||instanceDestroyed)return
              context.updateData(current=>({
                items:current.items.map(entry=>entry.id===item.id?{...entry,checked:!entry.checked}:entry),
              }))
            },{signal:context.signal})

            const record={row,checkbox,text}
            rows.set(item.id,record)
            return record
          }

          const projectRow=(record,item)=>{
            record.row.classList.toggle('oe-checklist__item--checked',item.checked)
            record.checkbox.setAttribute('aria-pressed',String(item.checked))
            record.checkbox.disabled=readOnly
            record.text.contentEditable=readOnly?'false':'true'
            if(record.text.innerHTML!==item.text){
              if(item.text)setSanitizedHtml(record.text,item.text)
              else record.text.textContent=''
            }
          }

          const reconcile=next=>{
            const live=new Set()
            for(const item of next.items){
              live.add(item.id)
              const record=rows.get(item.id)??createRow(item)
              projectRow(record,item)
              wrapper.appendChild(record.row)
            }
            for(const [id,record] of rows){
              if(live.has(id))continue
              record.row.remove()
              rows.delete(id)
            }
            data={items:next.items.map(item=>({...item}))}
          }

          reconcile(data)
          return {
            element:wrapper,
            read:()=>({
              items:data.items.map(item=>({
                id:item.id,
                text:rows.get(item.id)?.text.innerHTML.trim()??item.text,
                checked:item.checked,
              })),
            }),
            update(next){if(!instanceDestroyed)reconcile(next)},
            editableFields:()=>Object.freeze(data.items.flatMap(item=>{
              const element=rows.get(item.id)?.text
              return element?[Object.freeze({key:`item:${item.id}`,element,mode:/** @type {'rich-text'} */('rich-text')})]:[]
            })),
            setReadOnly(value){
              readOnly=value
              for(const record of rows.values()){
                record.checkbox.disabled=value
                record.text.contentEditable=value?'false':'true'
              }
            },
            focus(target){
              if(instanceDestroyed||readOnly)return
              const key=target?.fieldKey
              const id=key?.startsWith('item:')?key.slice(5):data.items[0]?.id
              rows.get(id)?.text.focus()
            },
            destroy(){instanceDestroyed=true;rows.clear()},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
