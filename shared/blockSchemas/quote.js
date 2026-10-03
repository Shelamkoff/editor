// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

export const quoteDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault: () => ({ text: '', caption: '' }),
  normalize(input) {
    if (typeof input?.text !== 'string') throw new TypeError('Quote text must be a string')
    if (typeof input?.caption !== 'string') throw new TypeError('Quote caption must be a string')
    return { text: input.text, caption: input.caption }
  },
  mapRichText(data, transform) {
    data.text = transform(data.text, 'text')
    data.caption = transform(data.caption, 'caption')
  },
})
