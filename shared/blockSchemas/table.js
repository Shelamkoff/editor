// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { tableFieldKey } from '../tableFieldKey.js'

export const tableDataSchema=createVersionedDataSchema({
  currentVersion:2,
  createDefault:()=>({
    withHeadings:false,
    rows:[{id:'row-0',cells:[{id:'cell-0-0',text:''}]}],
  }),
  normalize(input){
    if(input?.withHeadings!==undefined&&typeof input.withHeadings!=='boolean'){
      throw new TypeError('Table withHeadings must be a boolean')
    }
    if(!Array.isArray(input?.rows)||input.rows.length===0)throw new TypeError('Table rows must be a non-empty array')
    const rowIds=new Set()
    let width=null
    const rows=input.rows.map(row=>{
      if(!row||typeof row!=='object'||Array.isArray(row))throw new TypeError('Table row must be an object')
      if(typeof row.id!=='string'||!row.id)throw new TypeError('Table row id must be a non-empty string')
      if(rowIds.has(row.id))throw new Error(`Duplicate table row id: ${row.id}`)
      rowIds.add(row.id)
      if(!Array.isArray(row.cells)||row.cells.length===0)throw new TypeError('Table cells must be a non-empty array')
      if(width===null)width=row.cells.length
      if(row.cells.length!==width)throw new TypeError('Table rows must have equal width')
      const cellIds=new Set()
      const cells=row.cells.map(cell=>{
        if(!cell||typeof cell!=='object'||Array.isArray(cell))throw new TypeError('Table cell must be an object')
        if(typeof cell.id!=='string'||!cell.id)throw new TypeError('Table cell id must be a non-empty string')
        if(cellIds.has(cell.id))throw new Error(`Duplicate table cell id in row ${row.id}: ${cell.id}`)
        cellIds.add(cell.id)
        if(typeof cell.text!=='string')throw new TypeError('Table cell text must be a string')
        return {id:cell.id,text:cell.text}
      })
      return {id:row.id,cells}
    })
    return {withHeadings:Boolean(input.withHeadings),rows}
  },
  mapRichText(data,transform){
    data.rows=data.rows.map(row=>({
      ...row,
      cells:row.cells.map(cell=>({
        ...cell,
        text:transform(cell.text,tableFieldKey(row.id,cell.id)),
      })),
    }))
  },
})
