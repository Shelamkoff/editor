import { test, equal, assert } from './harness.js'
import { createLinkTool } from '../../../inline-tools/link.js'

export function register() {
  test('link actions apply in the selection owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const field = doc.createElement('p')
      field.contentEditable = 'true'
      field.textContent = 'abc'
      doc.body.appendChild(field)

      const text = field.firstChild
      const range = doc.createRange()
      range.selectNodeContents(text)
      const selection = view.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      window.getSelection().removeAllRanges()

      const tool = createLinkTool('URL', 'Link')
      let closed = false
      const panel = tool.renderActions({
        range,
        restoreSelection() {
          selection.removeAllRanges()
          selection.addRange(range)
        },
        mutate(operation) { operation() },
        close() { closed = true },
        showTooltip() {},
        hideTooltip() {},
      })
      assert(panel, 'link panel was not rendered')
      doc.body.appendChild(panel)
      const input = panel.querySelector('input')
      const apply = panel.querySelector('.oe-inline-tool--apply')
      input.value = 'https://example.com/path'
      apply.dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true }))

      const anchor = field.querySelector('a')
      assert(anchor, 'link was not created in the iframe document')
      equal(anchor.ownerDocument, doc)
      equal(anchor.textContent, 'abc')
      equal(anchor.getAttribute('href'), 'https://example.com/path')
      equal(closed, true)
      equal(window.getSelection().rangeCount, 0, 'ambient selection was mutated')
    } finally {
      iframe.remove()
    }
  })
}
