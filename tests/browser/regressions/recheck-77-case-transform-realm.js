import { test, equal, assert } from './harness.js'
import { createCaseTransformTool } from '../../../inline-tools/caseTransform.js'

export function register() {
  test('case transform preserves backward selection in the range owning realm', () => {
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
      const selection = view.getSelection()
      selection.removeAllRanges()
      selection.setBaseAndExtent(text, 3, text, 0)
      const range = selection.getRangeAt(0).cloneRange()
      window.getSelection().removeAllRanges()

      const tool = createCaseTransformTool('Case')
      tool.toggle({ range })

      equal(field.textContent, 'ABC')
      equal(selection.toString(), 'ABC')
      equal(selection.anchorOffset, 3, 'backward anchor was lost to the ambient selection')
      equal(selection.focusOffset, 0, 'backward focus was lost to the ambient selection')
      equal(window.getSelection().rangeCount, 0, 'ambient selection was mutated')
    } finally {
      iframe.remove()
    }
  })
}
