import { test, equal, assert } from './harness.js'
import { createBgColorTool } from '../../../inline-tools/colorPicker.js'

export function register() {
  test('background color picker uses the mounted toolbar realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let tool = null
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')

      const field = doc.createElement('p')
      field.className = 'oe-paragraph'
      field.contentEditable = 'true'
      field.textContent = 'abc'
      const toolbar = doc.createElement('div')
      toolbar.className = 'oe-inline-toolbar'
      const button = doc.createElement('button')
      button.innerHTML = '<span class="oe-inline-tool__color-dot"></span>'
      toolbar.appendChild(button)
      doc.body.append(field, toolbar)

      const text = field.firstChild
      const range = doc.createRange()
      range.selectNodeContents(text)
      const selection = view.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      window.getSelection().removeAllRanges()

      tool = createBgColorTool('Background')
      tool.onMount(button)
      tool.toggle({ range })

      equal(tool.isDropdownOpen(), true, 'picker did not read the iframe selection')
      equal(window.getSelection().rangeCount, 0, 'ambient selection was mutated')

      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      equal(tool.isDropdownOpen(), true, 'ambient document closed the iframe picker')

      doc.body.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true }))
      equal(tool.isDropdownOpen(), false, 'owning document did not close the picker')
    } finally {
      tool?.destroy()
      iframe.remove()
    }
  })
}
