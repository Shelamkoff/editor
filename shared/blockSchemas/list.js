// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

function assertUnique(items,label){
  const ids=new Set()
  for(const item of items){
    if(!item||typeof item!=='object'||Array.isArray(item))throw new TypeError(`${label} item must be an object`)
    if(typeof item.id!=='string'||!item.id)throw new TypeError(`${label} item id must be a non-empty string`)
    if(ids.has(item.id))throw new Error(`Duplicate ${label} item id: ${item.id}`)
    ids.add(item.id)
    if(typeof item.text!=='string')throw new TypeError(`${label} item text must be a string`)
  }
}

/** @returns {{style:'ordered'|'unordered',items:Array<{id:string,text:string}>}} */
function createDefault(){
  return {style:'unordered',items:[{id:'item-0',text:''}]}
}

export const listDataSchema=createVersionedDataSchema({
  currentVersion:2,
  legacyVersion:1,
  createDefault,
  normalize(input){
    if(input?.style!=='ordered'&&input?.style!=='unordered')throw new TypeError('List style must be ordered or unordered')
    if(!Array.isArray(input?.items)||input.items.length===0)throw new TypeError('List items must be a non-empty array')
    assertUnique(input.items,'List')
    return {
      style:input.style,
      items:input.items.map(item=>({id:item.id,text:item.text})),
    }
  },
  mapRichText(data,transform){
    data.items=data.items.map(item=>({...item,text:transform(item.text,`item:${item.id}`)}))
  },
  migrations:[{
    from:1,
    to:2,
    migrate(input){
      if(!Array.isArray(input?.items))throw new TypeError('Legacy list items must be an array')
      return {
        style:input.style,
        items:input.items.map((text,index)=>({id:`legacy-item-${index}`,text})),
      }
    },
  }],
})
