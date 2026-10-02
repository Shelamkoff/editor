// @ts-check
import { LINK_PREVIEW_TEMPLATES } from '../blockOptions.js'
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, text } from './helpers.js'

export const linkPreviewDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault: () => ({
    url: '',
    title: '',
    description: '',
    image: '',
    favicon: '',
    domain: '',
    template: 'notion',
  }),
  normalize(input) {
    if (!isRecord(input)) throw new TypeError('Link preview data must be an object')
    const template = typeof input.template === 'string' && LINK_PREVIEW_TEMPLATES.includes(input.template)
      ? input.template
      : 'notion'
    return {
      url: canonicalUrl(typeof input.url === 'string' ? input.url : '', 'external'),
      title: text(input.title),
      description: text(input.description),
      image: canonicalUrl(typeof input.image === 'string' ? input.image : '', 'media'),
      favicon: canonicalUrl(typeof input.favicon === 'string' ? input.favicon : '', 'media'),
      domain: text(input.domain),
      template,
    }
  },
})
