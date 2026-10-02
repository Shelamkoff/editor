// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

export const codeDataSchema=createVersionedDataSchema({
  currentVersion:1,
  legacyVersion:1,
  createDefault:()=>({code:'',language:'auto'}),
  normalize(input){
    if(typeof input?.code!=='string')throw new TypeError('Code value must be a string')
    if(input?.language!==undefined&&typeof input.language!=='string')throw new TypeError('Code language must be a string')
    return {code:input.code,language:input.language||'auto'}
  },
})
