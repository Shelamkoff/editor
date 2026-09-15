import { test, equal, assert } from './harness.js'
import { EditorRenderer } from '../../../renderer/index.js'

export function register() {
  test('renderTo creates built-in DOM, inline fragments and automatic styles in the target document', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let renderer = null
    try {
      const doc = iframe.contentDocument
      assert(doc, 'iframe document unavailable')
      const container = doc.createElement('main')
      doc.body.appendChild(container)
      renderer = new EditorRenderer({ blockTypes: ['paragraph'] })

      const ambientCreateElement = document.createElement
      document.createElement = () => { throw new Error('ambient document must not be used') }
      try {
        renderer.renderTo({
          version: '1',
          blocks: [{ id: 'p', type: 'paragraph', data: { text: '<strong>Owned</strong>' } }],
        }, container)
      } finally {
        document.createElement = ambientCreateElement
      }

      const wrapper = container.firstElementChild
      const paragraph = wrapper?.firstElementChild
      assert(wrapper && paragraph, 'rendered paragraph missing')
      equal(wrapper.ownerDocument, doc)
      equal(paragraph.ownerDocument, doc)
      equal(paragraph.querySelector('strong')?.ownerDocument, doc)
      assert(doc.head.querySelectorAll('link[data-oe-style]').length > 0, 'renderer styles were not installed in target document')

      renderer.destroy(container)
      equal(doc.head.querySelectorAll('link[data-oe-style]').length, 0)
    } finally {
      renderer?.destroy()
      iframe.remove()
    }
  })
  test('carousel renderTo falls back without borrowing the ambient carousel realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let renderer = null
    try {
      const doc = iframe.contentDocument
      assert(doc, 'iframe document unavailable')
      const container = doc.createElement('main')
      doc.body.appendChild(container)
      renderer = new EditorRenderer({ blockTypes: ['carousel'] })
      const pixel = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

      const ambientCreateElement = document.createElement
      document.createElement = () => { throw new Error('ambient carousel document must not be used') }
      try {
        renderer.renderTo({
          version: '1',
          blocks: [{
            id: 'c',
            type: 'carousel',
            data: {
              slides: [
                { id: 'a', type: 'image', src: pixel, alt: 'A' },
                { id: 'b', type: 'image', src: pixel, alt: 'B' },
              ],
              options: {
                loop: false, autoplay: false, autoplayDelay: 3000,
                navigation: true, pagination: true, thumbnails: false,
              },
            },
          }],
        }, container)
      } finally {
        document.createElement = ambientCreateElement
      }

      const root = container.querySelector('.editor-carousel-block')
      assert(root, 'carousel renderer root missing')
      equal(root.ownerDocument, doc, 'carousel renderer escaped the target document')
      assert(root.classList.contains('editor-carousel-block--static'), 'foreign-realm carousel did not use its safe static fallback')
      equal(root.querySelectorAll('.editor-carousel-block__slide').length, 2, 'static fallback lost carousel slides')
      assert(!root.querySelector('.carousel'), 'foreign-realm renderer invoked the ambient carousel runtime')
      for (const slide of root.querySelectorAll('.editor-carousel-block__slide')) {
        equal(slide.ownerDocument, doc, 'static carousel slide escaped the target document')
      }
    } finally {
      renderer?.destroy()
      iframe.remove()
    }
  })

  test('gallery renderTo opens its lightbox in the target document', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let renderer = null
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const container = doc.createElement('main')
      doc.body.appendChild(container)
      renderer = new EditorRenderer({ blockTypes: ['gallery'] })
      const pixel = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
      renderer.renderTo({
        version: '1',
        blocks: [{
          id: 'g', type: 'gallery',
          data: {
            images: [{ url: pixel, caption: 'Owned image' }],
            layout: 'auto', styles: {}, options: {},
          },
        }],
      }, container)

      const item = container.querySelector('.editor-gallery__item')
      assert(item, 'gallery item missing')
      const ambientCreateElement = document.createElement
      document.createElement = () => { throw new Error('ambient Expose document must not be used') }
      try {
        item.dispatchEvent(new view.MouseEvent('click', { bubbles: true }))
      } finally {
        document.createElement = ambientCreateElement
      }

      const dialog = doc.querySelector('.editor-gallery__lightbox')
      assert(dialog, 'foreign-realm gallery lightbox missing')
      equal(dialog.ownerDocument, doc, 'gallery lightbox escaped the target document')
      assert(!document.querySelector('.editor-gallery__lightbox'), 'gallery lightbox leaked into the ambient document')
      equal(dialog.querySelector('img')?.getAttribute('src'), pixel, 'gallery lightbox lost its image')
      dialog.querySelector('.editor-gallery__lightbox-close')?.click()
      assert(!doc.querySelector('.editor-gallery__lightbox'), 'gallery lightbox was not released')
    } finally {
      renderer?.destroy()
      iframe.remove()
    }
  })

  test('multi-person renderTo stays native in a foreign renderer realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let renderer = null
    try {
      const doc = iframe.contentDocument
      assert(doc, 'iframe document unavailable')
      const container = doc.createElement('main')
      doc.body.appendChild(container)
      renderer = new EditorRenderer({ blockTypes: ['person'] })

      const ambientCreateElement = document.createElement
      document.createElement = () => { throw new Error('ambient person carousel document must not be used') }
      try {
        renderer.renderTo({
          version: '1',
          blocks: [{
            id: 'people', type: 'person',
            data: {
              persons: [
                { name: 'Ada', role: 'Engineer', bio: '', avatar: '', links: [] },
                { name: 'Grace', role: 'Scientist', bio: '', avatar: '', links: [] },
              ],
            },
          }],
        }, container)
      } finally {
        document.createElement = ambientCreateElement
      }

      const root = container.querySelector('.editor-person')
      assert(root, 'person renderer root missing')
      equal(root.ownerDocument, doc, 'person renderer escaped the target document')
      const list = root.querySelector('.editor-person__list')
      assert(list, 'foreign-realm person renderer did not keep its native list')
      equal(list.querySelectorAll('.editor-person__card').length, 2, 'foreign-realm person renderer lost profiles')
      assert(!root.querySelector('.carousel'), 'foreign-realm person renderer invoked the ambient carousel runtime')
      for (const card of list.querySelectorAll('.editor-person__card')) {
        equal(card.ownerDocument, doc, 'person card escaped the target document')
      }
    } finally {
      renderer?.destroy()
      iframe.remove()
    }
  })

}
