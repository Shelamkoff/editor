import { EditorRenderer } from '../../../renderer/index.js'
import { createGalleryRenderer } from '../../../renderer/renderers/gallery/index.js'
import { test, equal, assert } from './harness.js'

const pixel = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
const gallery = { images: [{ url: pixel, caption: 'Image' }], layout: '1', styles: {}, options: {} }
const parse = text => document.createTextNode(text)

export function register() {
  for (const retirement of ['destroy', 'replace']) {
    test(`gallery controls retired by ${retirement} cannot reopen an unowned lightbox`, () => {
      const frame = document.createElement('iframe')
      document.body.appendChild(frame)
      const doc = frame.contentDocument
      const container = doc.createElement('main')
      doc.body.appendChild(container)
      const renderer = new EditorRenderer({ blockTypes: ['gallery'], injectStyles: false })
      try {
        renderer.renderTo({ blocks: [{ id: 'g', type: 'gallery', data: gallery }] }, container)
        const root = container.querySelector('.editor-gallery')
        const item = root.querySelector('.editor-gallery__item')
        item.click()
        assert(doc.querySelector('dialog'), 'live gallery must open')
        doc.querySelector('dialog button').click()
        if (retirement === 'destroy') {
          // Direct factory API also promises to dispose a rendered root.
          const direct = createGalleryRenderer('retired', {})
          const output = direct.render({ type: 'gallery', data: gallery }, parse, { ownerDocument: doc })
          container.appendChild(output)
          direct.destroy(output)
          output.querySelector('.retired-gallery__item').click()
        } else {
          renderer.renderTo({ blocks: [{ id: 'g', type: 'gallery', data: { ...gallery, images: [{ url: pixel, caption: 'New image' }] } }] }, container)
          item.click()
        }
        equal(doc.querySelectorAll('dialog').length, 0)
        renderer.destroy()
        equal(doc.querySelectorAll('dialog').length, 0, 'no lightbox may outlive its renderer')
      } finally {
        for (const dialog of doc.querySelectorAll('dialog')) dialog.querySelector('button')?.click()
        renderer.destroy(); frame.remove()
      }
    })
  }
}
