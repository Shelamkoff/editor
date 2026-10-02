// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { mapSpoilerTextFields } from '../mapTextFields.js'

export const spoilerDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault: () => ({ label: '', content: '' }),
  normalize(input) {
    if (typeof input?.label !== 'string') throw new TypeError('Spoiler label must be a string')
    if (typeof input?.content !== 'string') throw new TypeError('Spoiler content must be a string')
    return { label: input.label, content: input.content }
  },
  mapRichText(data, transform) {
    data.label = transform(data.label, 'label')
    data.content = transform(data.content, 'content')
  },
})
