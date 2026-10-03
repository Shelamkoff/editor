// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { COLUMN_LAYOUT_SIZES } from '../columnLayouts.js'

function defaultColumns(layout){
  const size=COLUMN_LAYOUT_SIZES[layout]
  return Array.from({length:size},(_,index)=>({id:`column-${index}`,content:''}))
}

export const columnsDataSchema=createVersionedDataSchema({
  currentVersion:2,
  createDefault:()=>({layout:'1-1',columns:defaultColumns('1-1')}),
  normalize(input){
    if(typeof input?.layout!=='string'||!Object.hasOwn(COLUMN_LAYOUT_SIZES,input.layout)){
      throw new TypeError('Columns layout is invalid')
    }
    if(!Array.isArray(input.columns)||input.columns.length!==COLUMN_LAYOUT_SIZES[input.layout]){
      throw new TypeError('Columns count must match layout')
    }
    const ids=new Set()
    const columns=input.columns.map(column=>{
      if(!column||typeof column!=='object'||Array.isArray(column))throw new TypeError('Column must be an object')
      if(typeof column.id!=='string'||!column.id)throw new TypeError('Column id must be a non-empty string')
      if(ids.has(column.id))throw new Error(`Duplicate column id: ${column.id}`)
      ids.add(column.id)
      if(typeof column.content!=='string')throw new TypeError('Column content must be a string')
      return {id:column.id,content:column.content}
    })
    return {layout:input.layout,columns}
  },
  mapRichText(data,transform){
    data.columns=data.columns.map(column=>({...column,content:transform(column.content,`column:${column.id}`)}))
  },
})
