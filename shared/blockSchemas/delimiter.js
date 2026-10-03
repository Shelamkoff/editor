// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

export const delimiterDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  createDefault: () => ({}),
  normalize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('Delimiter data must be an object')
    }
    return {}
  },
})
