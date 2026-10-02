// @ts-check
import { ATTACH_VARIANTS } from '../blockOptions.js'
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, nonNegativeNumber, text } from './helpers.js'

export const attachesDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault: () => ({ files: [], variant: 'f' }),
  normalize(input) {
    if (!isRecord(input)) throw new TypeError('Attaches data must be an object')
    if (!Array.isArray(input.files)) throw new TypeError('Attaches files must be an array')
    const files = input.files.map(file => {
      if (!isRecord(file)) throw new TypeError('Attachment file must be an object')
      return {
        url: canonicalUrl(typeof file.url === 'string' ? file.url : '', 'download', { allowEmpty: false }),
        name: text(file.name),
        extension: text(file.extension),
        size: nonNegativeNumber(file.size),
      }
    })
    const variant = typeof input.variant === 'string' && ATTACH_VARIANTS.includes(input.variant)
      ? input.variant
      : 'f'
    return { files, variant }
  },
})
