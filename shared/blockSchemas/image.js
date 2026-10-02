// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, positiveNumber, stringMap, text } from './helpers.js'

export const imageDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault: () => ({
    file: { url: '' },
    caption: '',
    withBorder: false,
    expanded: false,
    withBackground: false,
    styles: {},
  }),
  normalize(input) {
    if (!isRecord(input)) throw new TypeError('Image data must be an object')
    const file = isRecord(input.file) ? input.file : {}
    const url = canonicalUrl(typeof file.url === 'string' ? file.url : '', 'media')
    const normalizedFile = { url }
    const width = positiveNumber(file.width)
    const height = positiveNumber(file.height)
    if (width) normalizedFile.width = width
    if (height) normalizedFile.height = height
    return {
      file: normalizedFile,
      caption: text(input.caption),
      withBorder: input.withBorder === true,
      expanded: input.expanded === true,
      withBackground: input.withBackground === true,
      styles: stringMap(input.styles),
    }
  },
  mapRichText(data, transform) {
    data.caption = transform(data.caption, 'caption')
  },
})
