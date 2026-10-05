// @ts-check
import { setSanitizedHtml } from '../../plugin-kit/index.js'
import { tableDataSchema } from '../../shared/blockSchemas/table.js'
import { acceptsTextPayload, richTextFromPayload } from '../shared/textConversion.js'
import { createTextSelectionSlice } from '../shared/textSelectionSlice.js'

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
  /** @type {import('../../plugin-kit/types').BlockCapabilities<{withHeadings:boolean,rows:Array<{id:string,cells:Array<{id:string,text:string}>}>}>} */
  const capabilities=Object.freeze({
    selectionSlice:createTextSelectionSlice(tableDataSchema),
    formatting:Object.freeze({inlineTools:true}),
    empty:Object.freeze({isEmpty:data=>data.rows.every(row=>row.cells.every(cell=>cell.text.trim().length===0))}),
    shortcuts:Object.freeze(/** @type {import('../../plugin-kit/types').ShortcutCapability<any>} */ ({
      handle(input,data,context){
        if(input.key==='Enter'&&!input.shiftKey){
          const parts=context.splitField(input.fieldKey,input.selection)
          return {
            kind:'update',
            data:{...data,rows:data.rows.map(row=>({...row,cells:row.cells.map(cell=>
              `cell:${row.id}:${cell.id}`===input.fieldKey?{...cell,text:parts.before+'<br>'+parts.after}:cell)}))},
            focus:{fieldKey:input.fieldKey,offset:input.selection.start+1},
          }
        }
        if(input.key==='Enter')return {kind:'native'}
        if(input.key!=='Tab')return null
        const ordered=data.rows.flatMap(row=>row.cells.map(cell=>`cell:${row.id}:${cell.id}`))
        const index=ordered.indexOf(input.fieldKey)
        if(index<0)return null
        const next=ordered[index+(input.shiftKey?-1:1)]
        return next?{kind:'focus',target:{fieldKey:next,offset:input.shiftKey?'end':'start'}}:null
      },
    })),
    conversion:Object.freeze({
      selectionMode:'single',
      export(data){return {kind:'rich-text',data:{text:exportText(data)}}},
      canImport:acceptsTextPayload,
      import(payload){
        return {withHeadings:false,rows:[{id:'row-0',cells:[{id:'cell-0-0',text:richTextFromPayload(payload)}]}]}
      },
    }),
    clipboard:Object.freeze({
      slice(data,context){
        const hits=[]
        for(let rowIndex=0;rowIndex<data.rows.length;rowIndex++){
          const row=data.rows[rowIndex]
          for(let columnIndex=0;columnIndex<row.cells.length;columnIndex++){
            const cell=row.cells[columnIndex]
            const field=context.field(`cell:${row.id}:${cell.id}`)
            if(field)hits.push({rowIndex,columnIndex,field})
          }
        }
        if(!hits.length)throw new Error('Table clipboard selection is empty')
        const minRow=Math.min(...hits.map(hit=>hit.rowIndex))
        const maxRow=Math.max(...hits.map(hit=>hit.rowIndex))
        const minColumn=Math.min(...hits.map(hit=>hit.columnIndex))
        const maxColumn=Math.max(...hits.map(hit=>hit.columnIndex))
        const selectedRows=[]
        for(let rowIndex=minRow;rowIndex<=maxRow;rowIndex++){
          const sourceRow=data.rows[rowIndex]
          selectedRows.push({
            id:sourceRow.id,
            cells:sourceRow.cells.slice(minColumn,maxColumn+1).map((cell,offset)=>{
              const field=context.field(`cell:${sourceRow.id}:${cell.id}`)
              return {...cell,text:field?.selected??''}
            }),
          })
        }
        const remainingRows=data.rows.map(row=>({
          ...row,
          cells:row.cells.map(cell=>{
            const field=context.field(`cell:${row.id}:${cell.id}`)
            return field?{...cell,text:field.before+field.after}:{...cell}
          }),
        }))
        return {
          parts:[{kind:/** @type {'local-block'} */ ('local-block'),data:{
            withHeadings:data.withHeadings&&minRow===0,
            rows:selectedRows,
          }}],
          remaining:{withHeadings:data.withHeadings,rows:remainingRows},
          focus:null,
        }
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
    htmlImport:Object.freeze({
      matchesRoot(element){return element.tagName==='TABLE'},
      importRoot(table,context){
        const rowElements=[...table.querySelectorAll('tr')]
        const rows=rowElements.map(row=>({
          id:context.createId('row'),
          cells:[...row.querySelectorAll(':scope > th, :scope > td')].map(cell=>({
            id:context.createId('cell'),
            text:context.serializeRichText(cell),
          })),
        })).filter(row=>row.cells.length>0)
        if(rows.length===0)throw new TypeError('Imported table must contain rows')
        const width=rows[0].cells.length
        if(width===0||rows.some(row=>row.cells.length!==width)){
          throw new TypeError('Imported table rows must have equal non-zero width')
        }
        const withHeadings=[...rowElements[0].children].some(cell=>cell.tagName==='TH')
        return {withHeadings,rows}
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
