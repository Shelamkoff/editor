// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'

/**
 * @param {any} input
 * @returns {{ text: string, level: 2 | 3 | 4 | 5 | 6 }}
 */
function normalizeHeading(input) {
  if (Object.hasOwn(input, 'align')) {
    throw new TypeError('Heading alignment must use block tunes')
  }
  if (typeof input.text !== 'string') {
    throw new TypeError('Heading text must be a string')
  }
  if (!Number.isInteger(input.level) || input.level < 2 || input.level > 6) {
    throw new RangeError('Heading level must be an integer from 2 through 6')
  }
  return {
    text: input.text,
    level: /** @type {2 | 3 | 4 | 5 | 6} */ (input.level),
  }
}

export const headingDataSchema = createVersionedDataSchema({
  currentVersion: 2,
  legacyVersion: 1,
  createDefault: () => ({ text: '', level: /** @type {2} */ (2) }),
  normalize: normalizeHeading,
  migrations: [{
    from: 1,
    to: 2,
    migrate: input => ({ text: input.text, level: input.level }),
  }],
})
