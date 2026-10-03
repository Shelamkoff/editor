// @ts-check
import { setSanitizedHtml } from '../../plugin-kit/index.js'
import { listDataSchema } from '../../shared/blockSchemas/list.js'

const editorStyles=new URL('./list.css',import.meta.url).href
const ICON_UL='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M5 6v.01"/><path d="M5 12v.01"/><path d="M5 18v.01"/></svg>'
const ICON_OL='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 6h9"/><path d="M11 12h11"/><path d="M11 18h9"/><path d="M4 16a2 2 0 1 1 4 0c0 .591-.5 1-1 1.5l-3 2.5h4"/><path d="M6 10v-6l-2 2"/></svg>'

function fragmentHtml(range,root){
  const container=root.ownerDocument.createElement('div')
  container.appendChild(range.cloneContents())
  return container.innerHTML
}

function splitAtCaret(item,range){
  const document=item.ownerDocument
  const before=document.createRange()
  before.selectNodeContents(item)
  before.setEnd(range.startContainer,range.startOffset)
  const after=document.createRange()
  after.selectNodeContents(item)
  after.setStart(range.startContainer,range.startOffset)
  return {before:fragmentHtml(before,item),after:fragmentHtml(after,item)}
}

function atStart(item,range){
  const before=item.ownerDocument.createRange()
  before.selectNodeContents(item)
  before.setEnd(range.startContainer,range.startOffset)
  return before.toString().length===0&&before.cloneContents().childNodes.length===0
}

/**
 * Create the immutable List v2 definition with stable item identities.
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{style:'ordered'|'unordered',items:Array<{id:string,text:string}>}>}
 */
export function createListPlugin(){
  const toolbox=Object.freeze([
    Object.freeze({
      id:'unordered',
      label:Object.freeze({key:'bulletedTitle',fallback:'Bulleted List'}),
      icon:ICON_UL,
      configure(base){return {...base,style:'unordered'}},
    }),
    Object.freeze({
      id:'ordered',
      label:Object.freeze({key:'numberedTitle',fallback:'Numbered List'}),
      icon:ICON_OL,
      configure(base){return {...base,style:'ordered'}},
    }),
  ])

  /** @type {import('../../plugin-kit/types').BlockCapabilities<{style:'ordered'|'unordered',items:Array<{id:string,text:string}>}>} */
  const capabilities=Object.freeze({
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({
      isEmpty:data=>data.items.every(item=>item.text.trim().length===0),
    }),
    merge:Object.freeze({
      merge(target,source){
        const occupied=new Set(target.items.map(item=>item.id))
        const appended=source.items.map((item,index)=>{
          let id=item.id
          let suffix=0
          while(occupied.has(id))id=`merged-${index}-${suffix++}-${item.id}`
          occupied.add(id)
          return {...item,id}
        })
        return {...target,items:[...target.items,...appended]}
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
              data:{...data,items:data.items.filter(item=>item.id!==id)},
              ...(next?{focus:{fieldKey:`item:${next.id}`,offset:'end'}}:{}),
            }
          }
          const parts=context.splitField(input.fieldKey,input.selection)
          if(!parts)return null
          const newId=context.createId('item')
          const items=data.items.map(item=>item.id===id?{...item,text:parts.before}:item)
          items.splice(index+1,0,{id:newId,text:parts.after})
          return {kind:'update',data:{...data,items},focus:{fieldKey:`item:${newId}`,offset:'start'}}
        }
        if(input.key==='Backspace'&&input.selection.start===0&&input.selection.end===0&&index>0){
          const previous=data.items[index-1]
          const items=data.items.map(item=>({...item}))
          items[index-1].text+=items[index].text
          items.splice(index,1)
          return {kind:'update',data:{...data,items},focus:{fieldKey:`item:${previous.id}`,offset:'end'}}
        }
        return null
      },
    })),
    selectionSlice:Object.freeze({
      slice(data,start,end,context){
        const startId=start.fieldKey.startsWith('item:')?start.fieldKey.slice(5):''
        const endId=end.fieldKey.startsWith('item:')?end.fieldKey.slice(5):''
        const startIndex=data.items.findIndex(item=>item.id===startId)
        const endIndex=data.items.findIndex(item=>item.id===endId)
        if(startIndex<0||endIndex<startIndex)return null

        const beforeItems=data.items.slice(0,startIndex).map(item=>({...item}))
        const afterItems=data.items.slice(endIndex+1).map(item=>({...item}))
        const selected=[]

        if(startIndex===endIndex){
          const slice=context.sliceField(start.fieldKey,{start:start.offset,end:end.offset})
          if(!slice)return null
          if(slice.before)beforeItems.push({...data.items[startIndex],text:slice.before})
          if(slice.selected)selected.push(slice.selected)
          if(slice.after)afterItems.unshift({
            ...data.items[startIndex],
            id:context.createId('item'),
            text:slice.after,
          })
        }else{
          const first=context.sliceField(start.fieldKey,{start:start.offset,end:Number.MAX_SAFE_INTEGER})
          const last=context.sliceField(end.fieldKey,{start:0,end:end.offset})
          if(!first||!last)return null
          if(first.before)beforeItems.push({...data.items[startIndex],text:first.before})
          if(first.selected)selected.push(first.selected)
          for(let index=startIndex+1;index<endIndex;index++)selected.push(data.items[index].text)
          if(last.selected)selected.push(last.selected)
          if(last.after)afterItems.unshift({...data.items[endIndex],text:last.after})
        }

        if(selected.length===0)return null
        return {
          before:beforeItems.length?{...data,items:beforeItems}:null,
          selected:{kind:'rich-text',data:{text:selected.join('<br>'),style:data.style}},
          after:afterItems.length?{...data,items:afterItems}:null,
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
          throw new TypeError('List can only import rich-text payloads')
        }
        return {style:/** @type {'unordered'} */('unordered'),items:[{id:'item-0',text:payload.data.text}]}
      },
    }),
    settings:Object.freeze({
      kind:/** @type {'actions'} */('actions'),
      actions(data){
        return [
          Object.freeze({id:'unordered',label:Object.freeze({key:'bulletedTitle',fallback:'Bulleted List'}),icon:ICON_UL,active:data.style==='unordered'}),
          Object.freeze({id:'ordered',label:Object.freeze({key:'numberedTitle',fallback:'Numbered List'}),icon:ICON_OL,active:data.style==='ordered'}),
        ]
      },
      apply(data,actionId){
        if(actionId!=='ordered'&&actionId!=='unordered')throw new RangeError(`Unknown list style: ${actionId}`)
        return {...data,style:actionId}
      },
    }),
    htmlImport:Object.freeze({
      matchesRoot(element){
        return element.tagName==='UL'||element.tagName==='OL'
      },
      importRoot(element,context){
        const items=[...element.children].filter(child=>child.tagName==='LI').map(li=>({
          id:context.createId('item'),
          text:context.serializeRichText(li),
        }))
        if(!items.length)throw new TypeError('Imported list root must contain list items')
        return {
          style:element.tagName==='OL'?/** @type {'ordered'} */('ordered'):/** @type {'unordered'} */('unordered'),
          items,
        }
      },
    }),
  })

  return Object.freeze({
    type:'list',
    label:Object.freeze({key:'bulletedTitle',fallback:'Bulleted List'}),
    icon:ICON_UL,
    styles:Object.freeze([editorStyles]),
    toolbox,
    schema:listDataSchema,
    capabilities,
    setup(){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('List runtime is destroyed')
          const document=context.ownerDocument
          const host=document.createElement('div')
          host.className='oe-list-host'
          let list
          let data={style:initial.style,items:initial.items.map(item=>({...item}))}
          let readOnly=context.isReadOnly()
          let instanceDestroyed=false
          const nodes=new Map()

          const createItem=item=>{
            const li=document.createElement('li')
            li.className='oe-list__item'
            li.dataset.itemId=item.id
            li.contentEditable=readOnly?'false':'true'
            if(item.text)setSanitizedHtml(li,item.text)
            nodes.set(item.id,li)
            return li
          }

          const reconcile=next=>{
            const tag=next.style==='ordered'?'ol':'ul'
            if(!list||list.tagName.toLowerCase()!==tag){
              const replacement=document.createElement(tag)
              replacement.className=`oe-list oe-list--${next.style}`
              replacement.dataset.style=next.style
              if(list)list.replaceWith(replacement)
              else host.appendChild(replacement)
              list=replacement
            }
            const live=new Set()
            for(const item of next.items){
              live.add(item.id)
              const li=nodes.get(item.id)??createItem(item)
              li.contentEditable=readOnly?'false':'true'
              if(li.innerHTML!==item.text){
                if(item.text)setSanitizedHtml(li,item.text)
                else li.textContent=''
              }
              list.appendChild(li)
            }
            for(const [id,node] of nodes){
              if(live.has(id))continue
              node.remove()
              nodes.delete(id)
            }
            data={style:next.style,items:next.items.map(item=>({...item}))}
          }

          reconcile(data)
          return {
            element:host,
            read:()=>({
              style:data.style,
              items:data.items.map(item=>({
                id:item.id,
                text:nodes.get(item.id)?.innerHTML.trim()??item.text,
              })),
            }),
            update(next){if(!instanceDestroyed)reconcile(next)},
            editableFields:()=>Object.freeze(data.items.flatMap(item=>{
              const element=nodes.get(item.id)
              return element?[Object.freeze({
                key:`item:${item.id}`,
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
              const id=key?.startsWith('item:')?key.slice(5):data.items[0]?.id
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
