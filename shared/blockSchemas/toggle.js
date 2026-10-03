// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

export const toggleDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  createDefault: () => ({ title: '', content: '', open: false }),
  normalize(input) {
    if (typeof input?.title !== 'string') throw new TypeError('Toggle title must be a string')
    if (typeof input?.content !== 'string') throw new TypeError('Toggle content must be a string')
    if (input?.open !== undefined && typeof input.open !== 'boolean') {
      throw new TypeError('Toggle open must be a boolean')
    }
    return { title: input.title, content: input.content, open: Boolean(input.open) }
  },
  mapRichText(data, transform) {
    data.title = transform(data.title, 'title')
    data.content = transform(data.content, 'content')
  },
})
