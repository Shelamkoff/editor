// @ts-check
import { GALLERY_LAYOUTS } from '../blockOptions.js'
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, positiveNumber, stringMap, text } from './helpers.js'

/** @typedef {{ loop:boolean, zoom:boolean, navigation:boolean, captions:boolean, fullscreen:boolean, thumbnails:boolean, autoplayInterval?:number }} GalleryOptions */
/** @typedef {{ images:Array<{id:string,url:string,caption:string}>, layout:string, styles:Record<string,string>, options:GalleryOptions }} GalleryData */

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
  return { images: [], layout: 'auto', styles: {}, options: { ...DEFAULT_OPTIONS } }
}

export const galleryDataSchema = createVersionedDataSchema({
  currentVersion: 2,
  createDefault,
  normalize(input) {
    if (!isRecord(input)) throw new TypeError('Gallery data must be an object')
    if (!Array.isArray(input.images)) throw new TypeError('Gallery images must be an array')
    const ids=new Set()
    const images = input.images.map(image => {
      if (!isRecord(image)) throw new TypeError('Gallery image must be an object')
      if(typeof image.id!=='string'||!image.id)throw new TypeError('Gallery image requires a stable id')
      if(ids.has(image.id))throw new Error('Duplicate gallery image id: '+image.id)
      ids.add(image.id)
      return {
        id:image.id,
        url: canonicalUrl(typeof image.url === 'string' ? image.url : '', 'media', { allowEmpty: false }),
        caption: text(image.caption),
      }
    })
    let layout = 'auto'
    if (input.layout !== undefined) {
      if (typeof input.layout !== 'string' || !GALLERY_LAYOUTS.includes(input.layout)) {
        throw new TypeError('Gallery layout is invalid')
      }
      layout = input.layout
    }
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
    data.images = data.images.map(image => ({
      ...image,
      caption: transform(image.caption, 'image:' + image.id + ':caption'),
    }))
  },
})
