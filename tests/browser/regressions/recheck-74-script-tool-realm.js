import { test, assert, equal } from './harness.js'
import { createScriptTool } from '../../../inline-tools/scriptTool.js'

export function register() {
  test('script tool state and actions use the selection owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const field = doc.createElement('p')
      field.contentEditable = 'true'
      field.innerHTML = '<sup>A</sup>'
      doc.body.appendChild(field)

      const range = doc.createRange()
      range.selectNodeContents(field.querySelector('sup'))
      const selection = view.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      window.getSelection().removeAllRanges()

      const tool = createScriptTool({ sup: 'Superscript', sub: 'Subscript', none: 'None' })
      const button = doc.createElement('button')
      tool.onMount(button)
      equal(tool.isActive({ range }), true, 'active state read the ambient selection')

      const panel = tool.renderActions({
        range: range.cloneRange(),
        mutate(operation) { return operation() },
        restoreSelection() {},
        close() {},
        showTooltip() {},
        hideTooltip() {},
      })
      assert(panel?.ownerDocument === doc, 'script actions panel was created in the ambient document')
      for (const child of panel.children) {
        assert(child.ownerDocument === doc, 'script action control escaped the owning document')
      }
      tool.destroy()
    } finally {
      iframe.remove()
    }
  })
}
