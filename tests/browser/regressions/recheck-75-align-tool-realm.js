import { test, assert, equal } from './harness.js'
import { createAlignTool } from '../../../inline-tools/align.js'

export function register() {
  test('align tool resolves blocks and action UI through the selection owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')

      const editor = doc.createElement('div')
      editor.className = 'oe-editor'
      const block = doc.createElement('div')
      block.className = 'oe-block'
      block.dataset.blockId = 'a'
      const content = doc.createElement('p')
      content.contentEditable = 'true'
      content.textContent = 'Aligned'
      content.style.textAlign = 'right'
      block.appendChild(content)
      editor.appendChild(block)
      doc.body.appendChild(editor)

      const range = doc.createRange()
      range.selectNodeContents(content)
      const selection = view.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      window.getSelection().removeAllRanges()

      const tool = createAlignTool({ left: 'Left', center: 'Center', right: 'Right', justify: 'Justify' })
      const button = doc.createElement('button')
      tool.onMount(button)
      equal(tool.isActive({ range }), true, 'active alignment read the ambient selection')

      const panel = tool.renderActions({
        range: range.cloneRange(),
        mutate(operation) { return operation() },
        restoreSelection() {},
        close() {},
        showTooltip() {},
        hideTooltip() {},
      })
      assert(panel?.ownerDocument === doc, 'align actions panel was created in the ambient document')
      for (const child of panel.children) {
        assert(child.ownerDocument === doc, 'align action control escaped the owning document')
      }
      tool.destroy()
    } finally {
      iframe.remove()
    }
  })
}
