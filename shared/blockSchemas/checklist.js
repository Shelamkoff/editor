// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

export const checklistDataSchema=createVersionedDataSchema({
  currentVersion:2,
  legacyVersion:1,
  createDefault:()=>({items:[{id:'item-0',text:'',checked:false}]}),
  normalize(input){
    if(!Array.isArray(input?.items)||input.items.length===0)throw new TypeError('Checklist items must be a non-empty array')
    const ids=new Set()
    const items=input.items.map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item))throw new TypeError('Checklist item must be an object')
      if(typeof item.id!=='string'||!item.id)throw new TypeError('Checklist item id must be a non-empty string')
      if(ids.has(item.id))throw new Error(`Duplicate checklist item id: ${item.id}`)
      ids.add(item.id)
      if(typeof item.text!=='string')throw new TypeError('Checklist item text must be a string')
      if(typeof item.checked!=='boolean')throw new TypeError('Checklist item checked must be a boolean')
      return {id:item.id,text:item.text,checked:item.checked}
    })
    return {items}
  },
  mapRichText(data,transform){
    data.items=data.items.map(item=>({...item,text:transform(item.text,`item:${item.id}`)}))
  },
  migrations:[{
    from:1,
    to:2,
    migrate(input){
      if(!Array.isArray(input?.items))throw new TypeError('Legacy checklist items must be an array')
      return {
        items:input.items.map((item,index)=>({
          id:`legacy-item-${index}`,
          text:item?.text,
          checked:item?.checked,
        })),
      }
    },
  }],
})
