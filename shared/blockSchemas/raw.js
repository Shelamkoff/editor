// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

export const rawDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  createDefault: () => ({ html: '' }),
  normalize(input) {
    if (typeof input?.html !== 'string') throw new TypeError('Raw html must be a string')
    return { html: input.html }
  },
})
