// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, text } from './helpers.js'

export const embedDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  createDefault: () => ({
    service: '',
    videoId: '',
    caption: '',
    cover: '',
    title: '',
    duration: '',
  }),
  normalize(input) {
    if (!isRecord(input)) throw new TypeError('Embed data must be an object')
    const service = text(input.service)
    const videoId = text(input.videoId)
    if (service && service !== 'youtube' && service !== 'vimeo') {
      throw new TypeError('Embed service must be youtube, vimeo, or empty')
    }
    if (service === 'youtube' && videoId && !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      throw new TypeError('YouTube video id is invalid')
    }
    if (service === 'vimeo' && videoId && !/^\d+$/.test(videoId)) {
      throw new TypeError('Vimeo video id is invalid')
    }
    return {
      service,
      videoId,
      caption: text(input.caption),
      cover: canonicalUrl(typeof input.cover === 'string' ? input.cover : '', 'media'),
      title: text(input.title),
      duration: text(input.duration),
    }
  },
  mapRichText(data, transform) {
    data.caption = transform(data.caption, 'caption')
  },
})
