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

}
