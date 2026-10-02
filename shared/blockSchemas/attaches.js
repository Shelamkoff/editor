// @ts-check
import { ATTACH_VARIANTS } from '../blockOptions.js'
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, nonNegativeNumber, text } from './helpers.js'

export const attachesDataSchema = createVersionedDataSchema({
  currentVersion: 2,
  legacyVersion: 1,
  createDefault: () => ({ files: [], variant: 'f' }),
  normalize(input) {
    if (!isRecord(input)) throw new TypeError('Attaches data must be an object')
    if (!Array.isArray(input.files)) throw new TypeError('Attaches files must be an array')
    const ids=new Set()
    const files = input.files.map(file => {
      if (!isRecord(file)) throw new TypeError('Attachment file must be an object')
      if(typeof file.id!=='string'||!file.id)throw new TypeError('Attachment file requires a stable id')
      if(ids.has(file.id))throw new Error('Duplicate attachment file id: '+file.id)
      ids.add(file.id)
      return {
        id:file.id,
        url: canonicalUrl(typeof file.url === 'string' ? file.url : '', 'download', { allowEmpty: false }),
        name: text(file.name),
        extension: text(file.extension),
        size: nonNegativeNumber(file.size),
      }
    })
    const variant = typeof input.variant === 'string' && ATTACH_VARIANTS.includes(input.variant) ? input.variant : 'f'
    return { files, variant }
  },
  migrations:[{
    from:1,
    to:2,
    migrate(input){
      if(!Array.isArray(input?.files))throw new TypeError('Legacy attachment files must be an array')
      return {...input,files:input.files.map((file,index)=>({...file,id:'legacy-file-'+index}))}
    },
  }],
})
