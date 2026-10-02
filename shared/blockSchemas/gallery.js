// @ts-check
import { GALLERY_LAYOUTS } from '../blockOptions.js'
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, positiveNumber, stringMap, text } from './helpers.js'

const DEFAULT_OPTIONS = Object.freeze({
  loop: true,
  zoom: true,
  navigation: true,
  captions: true,
  fullscreen: true,
  thumbnails: false,
})

export const galleryDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault: () => ({
    images: [],
    layout: 'auto',
    styles: {},
    options: { ...DEFAULT_OPTIONS },
  }),
  normalize(input) {
    if (!isRecord(input)) throw new TypeError('Gallery data must be an object')
    if (!Array.isArray(input.images)) throw new TypeError('Gallery images must be an array')
    const images = input.images.map(image => {
      if (!isRecord(image)) throw new TypeError('Gallery image must be an object')
      return {
        url: canonicalUrl(typeof image.url === 'string' ? image.url : '', 'media', { allowEmpty: false }),
        caption: text(image.caption),
      }
    })
    const layout = typeof input.layout === 'string' && GALLERY_LAYOUTS.includes(input.layout)
      ? input.layout
      : 'auto'
    const sourceOptions = isRecord(input.options) ? input.options : {}
    const options = {}
    for (const [key, fallback] of Object.entries(DEFAULT_OPTIONS)) {
      options[key] = typeof sourceOptions[key] === 'boolean' ? sourceOptions[key] : fallback
    }
    const autoplayInterval = positiveNumber(sourceOptions.autoplayInterval)
    if (autoplayInterval) options.autoplayInterval = autoplayInterval
    return { images, layout, styles: stringMap(input.styles), options }
  },
  mapRichText(data, transform) {
    data.images = data.images.map((image, index) => ({
      ...image,
      caption: transform(image.caption, 'caption:' + index),
    }))
  },
})
