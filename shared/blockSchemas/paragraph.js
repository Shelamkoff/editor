// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

/**
 * @param {any} input
 * @returns {{ text: string }}
 */
function normalizeParagraph(input) {
  if (Object.hasOwn(input, 'align')) {
    throw new TypeError('Paragraph alignment must use block tunes')
  }
  if (typeof input.text !== 'string') {
    throw new TypeError('Paragraph text must be a string')
  }
  return { text: input.text }
}

export const paragraphDataSchema = createVersionedDataSchema({
  currentVersion: 2,
  createDefault: () => ({ text: '' }),
  normalize: normalizeParagraph,
  mapRichText(data, transform) {
    data.text = transform(data.text, 'text')
  },
})
