import { test, equal, assert } from './harness.js'
import { createEditor } from '../../../core/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'

export function register() {
  test('block toolbar lifecycle and outside-click handling stay in the editor owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let editor = null
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')

      const holder = doc.createElement('div')
      doc.body.appendChild(holder)
      editor = createEditor({
        holder,
        injectStyles: false,
        plugins: [new Paragraph()],
        inlineTools: [],
        data: { version: '1', blocks: [{ id: 'a', type: 'paragraph', data: { text: 'A' } }] },
        tuning: {
          undo: { debounceMs: 10000 }, change: { debounceMs: 10000 },
          animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 0 },
          mobileBreakpoint: 1,
        },
      })

      editor.blocks.setCurrentIndex(0)
      const plus = editor.rootElement.querySelector('.oe-toolbar__btn:not(.oe-toolbar__drag)')
      const toolbox = editor.rootElement.querySelector('.oe-toolbox')
      assert(plus && toolbox, 'toolbar controls exist')
      equal(plus.ownerDocument, doc, 'toolbar control escaped the editor document')

      plus.click()
      equal(plus.getAttribute('aria-expanded'), 'true', 'toolbox did not open')

      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      equal(plus.getAttribute('aria-expanded'), 'true', 'ambient document closed the iframe toolbox')

      doc.body.dispatchEvent(new view.MouseEvent('click', { bubbles: true }))
      equal(plus.getAttribute('aria-expanded'), 'false', 'owning document did not close the toolbox')
    } finally {
      editor?.destroy()
      iframe.remove()
    }
  })
}
