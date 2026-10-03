// @ts-check
import { parseColorInput } from '@shelamkoff/color-picker'
import { createVersionedDataSchema } from '../versionedDataSchema.js'

export const colorWidgetSchema=createVersionedDataSchema({
  currentVersion:1,
  createDefault:()=>({value:'#4357b4'}),
  normalize(input){
    const value=typeof input?.value==='string'?input.value.trim():''
    if(!value||!parseColorInput(value))throw new TypeError('Color widget value must be a valid CSS color')
    return {value}
  },
})
