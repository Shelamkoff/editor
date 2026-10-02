// @ts-check
import { paragraphDataSchema } from './paragraph.js'
import { headingDataSchema } from './heading.js'

const schemas = new Map([
  ['paragraph', paragraphDataSchema],
  ['heading', headingDataSchema],
])

/**
 * Return the neutral built-in data schema for a block type when Phase 1 has
 * migrated that type. The registry grows one vertical slice at a time and is
 * shared by editor and renderer composition until schemas move onto v2 plugin
 * definitions.
 *
 * @param {string} type
 */
export function getBuiltInBlockDataSchema(type) {
  return schemas.get(type)
}
