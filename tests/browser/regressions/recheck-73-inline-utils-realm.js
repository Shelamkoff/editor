import { test, assert, equal } from './harness.js'
import { createBackButton, restoreSelectionOffsets, saveSelectionOffsets, toggleTag } from '../../../inline-tools/utils.js'

export function register() {
  test('shared inline range helpers stay in the range owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const field = doc.createElement('p')
      field.contentEditable = 'true'
      field.textContent = 'ABC'
      doc.body.appendChild(field)

      const range = doc.createRange()
      range.setStart(field.firstChild, 1)
      range.setEnd(field.firstChild, 2)
      const selection = view.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      window.getSelection().removeAllRanges()

      const saved = saveSelectionOffsets(range)
      toggleTag('b', range)
      equal(field.innerHTML.toLowerCase(), 'a<b>b</b>c')
      equal(selection.toString(), 'B', 'formatted selection moved to the ambient page')
      equal(window.getSelection().rangeCount, 0, 'ambient page selection was mutated')

      selection.removeAllRanges()
      const collapsed = doc.createRange()
      collapsed.setStart(field, 0)
      collapsed.collapse(true)
      selection.addRange(collapsed)
      restoreSelectionOffsets(null, saved)
      equal(selection.toString(), 'B', 'offset restoration used the ambient document')
      equal(window.getSelection().rangeCount, 0, 'offset restoration mutated the ambient page')

      const back = createBackButton({ range, close() {} })
      assert(back.ownerDocument === doc, 'actions UI was created in the ambient document')
    } finally {
      iframe.remove()
    }
  })
}
