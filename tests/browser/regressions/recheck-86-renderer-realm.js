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
}
