// @ts-check
import { GALLERY_LAYOUTS } from '../blockOptions.js'
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, positiveNumber, stringMap, text } from './helpers.js'

/** @typedef {{ loop:boolean, zoom:boolean, navigation:boolean, captions:boolean, fullscreen:boolean, thumbnails:boolean, autoplayInterval?:number }} GalleryOptions */
/** @typedef {{ images:Array<{url:string,caption:string}>, layout:string, styles:Record<string,string>, options:GalleryOptions }} GalleryData */

/** @type {Readonly<GalleryOptions>} */
const DEFAULT_OPTIONS = Object.freeze({
  loop: true,
  zoom: true,
  navigation: true,
  captions: true,
  fullscreen: true,
  thumbnails: false,
})

/** @returns {GalleryData} */
function createDefault() {
  return {
    images: [],
    layout: 'auto',
    styles: {},
    options: { ...DEFAULT_OPTIONS },
  }
}

export const galleryDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault,
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
    /** @type {GalleryOptions} */
    const options = { ...DEFAULT_OPTIONS }
    for (const key of ['loop', 'zoom', 'navigation', 'captions', 'fullscreen', 'thumbnails']) {
      const value = sourceOptions[key]
      if (typeof value === 'boolean') options[key] = value
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
