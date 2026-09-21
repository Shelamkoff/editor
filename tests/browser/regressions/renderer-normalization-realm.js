import { EditorRenderer } from '../../../renderer/index.js'
import { test, equal, assert } from './harness.js'

export function register() {
  for (const valid of [false, true]) {
    test(`Carousel ${valid ? 'valid' : 'legacy'} HTML uses the render target document during normalization`, () => {
      const iframe = document.createElement('iframe')
      document.body.appendChild(iframe)
      const doc = iframe.contentDocument
      const container = doc.createElement('main')
      doc.body.appendChild(container)
      const renderer = new EditorRenderer({ blockTypes: ['carousel'], injectStyles: false })
      const block = { id: 'c', type: 'carousel', data: { slides: [
        { id: 's', type: 'html', html: '<p>Owned <strong>content</strong></p><script>window.__unsafe = true</script>' },
      ], ...(valid ? { options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false } } : {}) } }
      const source = JSON.stringify(block)
      const ambientCreate = document.createElement
      try {
        try {
          // A renderer explicitly targeting another realm must not allocate
          // sanitizer nodes in the ambient document (also applies to legacy input).
          document.createElement = () => { throw new Error('ambient document used while normalizing foreign output') }
          renderer.renderTo({ blocks: [block] }, container)
        } finally {
          document.createElement = ambientCreate
        }
        equal(container.textContent, 'Owned content')
        equal(container.querySelector('strong').ownerDocument, doc)
        equal(container.querySelectorAll('script').length, 0)
        equal(JSON.stringify(block), source)
        assert(container.querySelector('.editor-carousel-block--static'))
      } finally { renderer.destroy(); iframe.remove() }
    })
  }
}
