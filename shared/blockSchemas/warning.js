// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { mapWarningTextFields } from '../mapTextFields.js'

export const warningDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault: () => ({ title: '', message: '' }),
  normalize(input) {
    if (typeof input?.title !== 'string') throw new TypeError('Warning title must be a string')
    if (typeof input?.message !== 'string') throw new TypeError('Warning message must be a string')
    return { title: input.title, message: input.message }
  },
  mapRichText(data, transform) {
    mapWarningTextFields(data, (html) => transform(html, 'message'))
  },
})
