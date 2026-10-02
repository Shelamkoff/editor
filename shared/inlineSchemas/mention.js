// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

export const mentionWidgetSchema=createVersionedDataSchema({
  currentVersion:1,
  legacyVersion:1,
  createDefault:()=>({id:'',name:''}),
  normalize(input){
    if(typeof input?.id!=='string')throw new TypeError('Mention id must be a string')
    if(typeof input?.name!=='string')throw new TypeError('Mention name must be a string')
    return {id:input.id,name:input.name}
  },
})
