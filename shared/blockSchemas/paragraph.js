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
  legacyVersion: 1,
  createDefault: () => ({ text: '' }),
  normalize: normalizeParagraph,
  mapRichText(data, transform) {
    data.text = transform(data.text, 'text')
  },
  migrations: [{
    from: 1,
    to: 2,
    migrate: input => ({ text: input.text }),
  }],
})
