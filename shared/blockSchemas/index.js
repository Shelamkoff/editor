// @ts-check
import { paragraphDataSchema } from './paragraph.js'
import { headingDataSchema } from './heading.js'
import { listDataSchema } from './list.js'
import { quoteDataSchema } from './quote.js'
import { codeDataSchema } from './code.js'
import { imageDataSchema } from './image.js'
import { delimiterDataSchema } from './delimiter.js'
import { tableDataSchema } from './table.js'
import { checklistDataSchema } from './checklist.js'
import { warningDataSchema } from './warning.js'
import { embedDataSchema } from './embed.js'
import { rawDataSchema } from './raw.js'
import { galleryDataSchema } from './gallery.js'
import { carouselDataSchema } from './carousel.js'
import { attachesDataSchema } from './attaches.js'
import { linkPreviewDataSchema } from './linkPreview.js'
import { toggleDataSchema } from './toggle.js'
import { columnsDataSchema } from './columns.js'
import { spoilerDataSchema } from './spoiler.js'
import { pollDataSchema } from './poll.js'
import { personDataSchema } from './person.js'

const schemas = new Map([
  ['paragraph', paragraphDataSchema],
  ['heading', headingDataSchema],
  ['list', listDataSchema],
  ['quote', quoteDataSchema],
  ['code', codeDataSchema],
  ['image', imageDataSchema],
  ['delimiter', delimiterDataSchema],
  ['table', tableDataSchema],
  ['checklist', checklistDataSchema],
  ['warning', warningDataSchema],
  ['embed', embedDataSchema],
  ['raw', rawDataSchema],
  ['gallery', galleryDataSchema],
  ['carousel', carouselDataSchema],
  ['attaches', attachesDataSchema],
  ['linkPreview', linkPreviewDataSchema],
  ['toggle', toggleDataSchema],
  ['columns', columnsDataSchema],
  ['spoiler', spoilerDataSchema],
  ['poll', pollDataSchema],
  ['person', personDataSchema],
])

/**
 * Return the canonical built-in data schema shared by editor plugins and
 * renderer registrations.
 *
 * @param {string} type
 */
export function getBuiltInBlockDataSchema(type) {
  return schemas.get(type)
}
