import { test, equal } from './harness.js'
import { createClearFormattingTool } from '../../../inline-tools/clearFormatting.js'

export function register() {
  test('clear formatting reads and restores selection from the range owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      const field = doc.createElement('p')
      field.contentEditable = 'true'
      field.innerHTML = '<b>Bold</b>'
      doc.body.appendChild(field)

      const text = field.querySelector('b').firstChild
      const range = doc.createRange()
      range.selectNodeContents(text)
      const selection = view.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      window.getSelection().removeAllRanges()

      const tool = createClearFormattingTool('Clear')
      tool.toggle({ range })

      equal(field.textContent, 'Bold')
      equal(field.querySelector('b'), null, 'formatting was not removed in the owning document')
      equal(selection.toString(), 'Bold', 'selection was not restored in the owning document')
      equal(window.getSelection().rangeCount, 0, 'ambient selection was mutated')
    } finally {
      iframe.remove()
    }
  })
}
