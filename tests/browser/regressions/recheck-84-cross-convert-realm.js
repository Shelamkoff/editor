import { test, equal, assert } from './harness.js'
import { createEditor } from '../../../core/index.js'
import { Paragraph, Heading } from '../../../plugins/index.js'
import { convertSelection } from './conversion-fixture.js'

export function register() {
  test('partial cross-block conversion creates ranges in the editor owning document', () => {
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
        plugins: [new Paragraph(), new Heading()],
        inlineTools: [],
        data: {
          version: '1',
          blocks: [
            { id: 'a', type: 'paragraph', data: { text: 'Alpha' } },
            { id: 'b', type: 'paragraph', data: { text: 'Bravo' } },
          ],
        },
        tuning: {
          undo: { debounceMs: 10000 }, change: { debounceMs: 10000 },
          animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 0 },
          mobileBreakpoint: 1,
        },
      })

      const first = editor.blocks.getBlockById('a').contentElement
      const last = editor.blocks.getBlockById('b').contentElement
      const range = doc.createRange()
      range.setStart(first.firstChild, 2)
      range.setEnd(last.firstChild, 3)
      const selection = view.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      doc.dispatchEvent(new view.Event('selectionchange'))

      convertSelection(editor, 'heading')

      const blocks = editor.save().blocks
      equal(blocks.map(block => block.type), ['paragraph', 'heading', 'heading', 'paragraph'])
      equal(blocks.map(block => block.data.text), ['Al', 'pha', 'Bra', 'vo'])
    } finally {
      editor?.destroy()
      iframe.remove()
    }
  })
}
