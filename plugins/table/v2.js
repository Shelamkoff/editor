// @ts-check
import { setSanitizedHtml } from '../../plugin-kit/index.js'
import { tableDataSchema } from '../../shared/blockSchemas/table.js'

const editorStyles=new URL('./table.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z"/><path d="M3 10h18"/><path d="M10 3v18"/></svg>'
const ICON_ROW_ADD='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1z"/><path d="M12 15v4"/><path d="M10 17h4"/></svg>'
const ICON_ROW_DEL='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1z"/><path d="M10 17h4"/></svg>'
const ICON_COL_ADD='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4v16a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M17 10v4"/><path d="M15 12h4"/></svg>'
const ICON_COL_DEL='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4v16a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M15 12h4"/></svg>'
const ICON_HEADER='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z"/><path d="M3 10h18"/><path d="M10 3v7"/></svg>'

function cloneData(data){
  return {
    withHeadings:data.withHeadings,
    rows:data.rows.map(row=>({id:row.id,cells:row.cells.map(cell=>({...cell}))})),
  }
}

function exportText(data){
  return data.rows.map(row=>row.cells.map(cell=>cell.text).filter(Boolean).join(' — ')).filter(Boolean).join('<br>')
}

/**
 * Create the immutable Table v2 definition with stable row and cell identities.
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{withHeadings:boolean,rows:Array<{id:string,cells:Array<{id:string,text:string}>}>}>}
 */
export function createTablePlugin(){
  const capabilities=Object.freeze({
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>data.rows.every(row=>row.cells.every(cell=>cell.text.trim().length===0))}),
    conversion:Object.freeze({
      export(data){return {kind:'rich-text',data:{text:exportText(data)}}},
      canImport(payload){return payload?.kind==='rich-text'&&typeof payload.data?.text==='string'},
      import(payload){
        if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string')throw new TypeError('Table can only import rich-text payloads')
        return {withHeadings:false,rows:[{id:'row-0',cells:[{id:'cell-0-0',text:payload.data.text}]}]}
      },
    }),
    settings:Object.freeze({
      kind:/** @type {'actions'} */('actions'),
      actions(data){
        const width=data.rows[0]?.cells.length??1
        return [
          Object.freeze({id:'header',label:Object.freeze({key:'toggleHeader',fallback:'Toggle header'}),icon:ICON_HEADER,active:data.withHeadings}),
          Object.freeze({id:'row-add',label:Object.freeze({key:'addRow',fallback:'Add row'}),icon:ICON_ROW_ADD}),
          Object.freeze({id:'row-del',label:Object.freeze({key:'deleteRow',fallback:'Delete row'}),icon:ICON_ROW_DEL,disabled:data.rows.length<=1}),
          Object.freeze({id:'col-add',label:Object.freeze({key:'addColumn',fallback:'Add column'}),icon:ICON_COL_ADD}),
          Object.freeze({id:'col-del',label:Object.freeze({key:'deleteColumn',fallback:'Delete column'}),icon:ICON_COL_DEL,disabled:width<=1}),
        ]
      },
      apply(data,actionId,context){
        const next=cloneData(data)
        switch(actionId){
          case 'header':
            next.withHeadings=!next.withHeadings
            return next
          case 'row-add':{
            const width=next.rows[0]?.cells.length??1
            next.rows.push({
              id:context.createId('row'),
              cells:Array.from({length:width},()=>({id:context.createId('cell'),text:''})),
            })
            return next
          }
          case 'row-del':
            if(next.rows.length>1)next.rows.pop()
            return next
          case 'col-add':
            for(const row of next.rows)row.cells.push({id:context.createId('cell'),text:''})
            return next
          case 'col-del':
            if((next.rows[0]?.cells.length??0)>1){
              for(const row of next.rows)row.cells.pop()
            }
            return next
          default:
            throw new RangeError(`Unknown table setting: ${actionId}`)
        }
      },
    }),
    paste:Object.freeze({
      accepts(input){return input.kind==='html'&&/<table(?:\s|>)/i.test(input.html)},
      resolve(input,context){
        if(input.kind!=='html')return null
        const template=context.ownerDocument.createElement('template')
        template.innerHTML=input.html
        const table=template.content.querySelector('table')
        if(!table)return null
        const rowElements=[...table.querySelectorAll('tr')]
        const rows=rowElements.map(row=>({
          id:context.createId('row'),
          cells:[...row.querySelectorAll(':scope > th, :scope > td')].map(cell=>({
            id:context.createId('cell'),
            text:cell.innerHTML,
          })),
        })).filter(row=>row.cells.length>0)
        if(rows.length===0)return null
        const width=rows[0].cells.length
        if(width===0||rows.some(row=>row.cells.length!==width))return null
        const withHeadings=[...rowElements[0].children].some(cell=>cell.tagName==='TH')
        return {kind:/** @type {'block'} */('block'),data:{withHeadings,rows}}
      },
    }),
  })

  return Object.freeze({
    type:'table',
    label:Object.freeze({key:'title',fallback:'Table'}),
    icon:ICON,
    styles:Object.freeze([editorStyles]),
    schema:tableDataSchema,
    capabilities,
    setup(){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('Table runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-table-wrapper'
          const table=document.createElement('table')
          table.className='oe-table'
          wrapper.appendChild(table)

          let data=cloneData(initial)
          let readOnly=context.isReadOnly()
          let instanceDestroyed=false
          const rows=new Map()
          const cells=new Map()
          const cellKey=(rowId,cellId)=>`${rowId}:${cellId}`

          const createRow=rowData=>{
            const row=document.createElement('tr')
            row.dataset.rowId=rowData.id
            rows.set(rowData.id,row)
            return row
          }
          const createCell=(rowData,cellData,rowIndex)=>{
            const tag=data.withHeadings&&rowIndex===0?'th':'td'
            const cell=document.createElement(tag)
            cell.className='oe-table__cell'
            cell.dataset.cellId=cellData.id
            cell.dataset.rowId=rowData.id
            cell.contentEditable=readOnly?'false':'true'
            if(cellData.text)setSanitizedHtml(cell,cellData.text)
            cells.set(cellKey(rowData.id,cellData.id),cell)
            return cell
          }

          const ensureCellTag=(rowData,cellData,rowIndex)=>{
            let cell=cells.get(cellKey(rowData.id,cellData.id))
            const desired=data.withHeadings&&rowIndex===0?'TH':'TD'
            if(cell&&cell.tagName!==desired){
              const replacement=document.createElement(desired.toLowerCase())
              replacement.className='oe-table__cell'
              replacement.dataset.cellId=cellData.id
              replacement.dataset.rowId=rowData.id
              replacement.contentEditable=readOnly?'false':'true'
              while(cell.firstChild)replacement.appendChild(cell.firstChild)
              cell.replaceWith(replacement)
              cells.set(cellKey(rowData.id,cellData.id),replacement)
              cell=replacement
            }
            return cell
          }

          const reconcile=next=>{
            const previousHeadings=data.withHeadings
            data=cloneData(next)
            wrapper.dataset.headings=String(data.withHeadings)
            const liveRows=new Set()
            const liveCells=new Set()
            data.rows.forEach((rowData,rowIndex)=>{
              liveRows.add(rowData.id)
              const row=rows.get(rowData.id)??createRow(rowData)
              table.appendChild(row)
              rowData.cells.forEach(cellData=>{
                liveCells.add(cellKey(rowData.id,cellData.id))
                let cell=cells.get(cellKey(rowData.id,cellData.id))??createCell(rowData,cellData,rowIndex)
                if(previousHeadings!==data.withHeadings)cell=ensureCellTag(rowData,cellData,rowIndex)??cell
                cell.contentEditable=readOnly?'false':'true'
                if(cell.innerHTML!==cellData.text){
                  if(cellData.text)setSanitizedHtml(cell,cellData.text)
                  else cell.textContent=''
                }
                row.appendChild(cell)
              })
            })
            for(const [id,cell] of cells){
              if(liveCells.has(id))continue
              cell.remove()
              cells.delete(id)
            }
            for(const [id,row] of rows){
              if(liveRows.has(id))continue
              row.remove()
              rows.delete(id)
            }
          }

          reconcile(data)

          table.addEventListener('keydown',event=>{
            if(readOnly||instanceDestroyed)return
            const target=/** @type {Element|null} */(event.target)
            const cell=/** @type {HTMLElement|null} */(target?.closest?.('td[data-cell-id],th[data-cell-id]')??null)
            if(!cell||!table.contains(cell))return
            if(event.key==='Enter'){
              event.stopPropagation()
              return
            }
            if(event.key!=='Tab')return
            const ordered=data.rows.flatMap(row=>row.cells.map(item=>cellKey(row.id,item.id)))
            const rowId=cell.dataset.rowId
            const id=cell.dataset.cellId
            const currentKey=rowId&&id?cellKey(rowId,id):''
            const index=currentKey?ordered.indexOf(currentKey):-1
            if(index<0)return
            const next=ordered[index+(event.shiftKey?-1:1)]
            if(!next)return
            event.preventDefault()
            event.stopPropagation()
            cells.get(next)?.focus()
          },{signal:context.signal})

          return {
            element:wrapper,
            read:()=>({
              withHeadings:data.withHeadings,
              rows:data.rows.map(row=>({
                id:row.id,
                cells:row.cells.map(cell=>({
                  id:cell.id,
                  text:cells.get(cellKey(row.id,cell.id))?.innerHTML.trim()??cell.text,
                })),
              })),
            }),
            update(next){if(!instanceDestroyed)reconcile(next)},
            editableFields:()=>Object.freeze(data.rows.flatMap(row=>row.cells.flatMap(cell=>{
              const element=cells.get(cellKey(row.id,cell.id))
              return element?[Object.freeze({
                key:`cell:${row.id}:${cell.id}`,
                element,
                mode:/** @type {'rich-text'} */('rich-text'),
              })]:[]
            }))),
            setReadOnly(value){
              readOnly=value
              for(const cell of cells.values())cell.contentEditable=value?'false':'true'
            },
            focus(target){
              if(instanceDestroyed||readOnly)return
              const key=target?.fieldKey
              if(key?.startsWith('cell:')){
                const parts=key.split(':')
                const rowId=parts[1]
                const cellId=parts.slice(2).join(':')
                cells.get(cellKey(rowId,cellId))?.focus()
                return
              }
              const firstRow=data.rows[0]
              const first=firstRow?.cells[0]?.id
              if(firstRow&&first)cells.get(cellKey(firstRow.id,first))?.focus()
            },
            destroy(){instanceDestroyed=true;rows.clear();cells.clear()},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
