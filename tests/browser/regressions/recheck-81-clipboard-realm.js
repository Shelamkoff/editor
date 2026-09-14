import { test, equal, assert } from './harness.js'
import { createEditor } from '../../../core/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { PasteRouter } from '../../../core/clipboard/PasteRouter.js'
import { prepareHtmlPaste } from '../../../core/clipboard/pasteInsert.js'

function createIframeEditor(doc, blocks) {
  const holder = doc.createElement('div')
  doc.body.appendChild(holder)
  const editor = createEditor({
    holder,
    injectStyles: false,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: { version: '1', blocks },
    tuning: {
      undo: { debounceMs: 10000 }, change: { debounceMs: 10000 },
      animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 0 },
    },
  })
  return { editor, holder }
}

export function register() {
  test('clipboard beforeinput consumes the selection from the editor owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let editor = null
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const created = createIframeEditor(doc, [
        { id: 'a', type: 'paragraph', data: { text: 'A' } },
        { id: 'b', type: 'paragraph', data: { text: 'B' } },
      ])
      editor = created.editor
      const first = editor.blocks.getBlockById('a').contentElement
      const last = editor.blocks.getBlockById('b').contentElement
      const range = doc.createRange()
      range.setStart(first.firstChild, 0)
      range.setEnd(last.firstChild, 1)
      const selection = view.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      window.getSelection().removeAllRanges()

      const input = new view.InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertReplacementText',
        data: 'X',
      })
      first.dispatchEvent(input)

      equal(input.defaultPrevented, true, 'ambient HTMLElement/selection bypassed the clipboard handler')
      assert(editor.rootElement.textContent.includes('X'), 'replacement text was not inserted')
      equal(window.getSelection().rangeCount, 0, 'ambient selection was mutated')
    } finally {
      editor?.destroy()
      iframe.remove()
    }
  })

  test('clipboard leaves iframe form-control copy to the native control', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let editor = null
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const created = createIframeEditor(doc, [
        { id: 'a', type: 'paragraph', data: { text: 'A' } },
      ])
      editor = created.editor
      editor.blocks.selectBlocks(['a'])
      const field = editor.blocks.getBlockById('a').contentElement
      const nativeInput = doc.createElement('input')
      nativeInput.value = 'native'
      field.appendChild(nativeInput)

      const copy = new view.ClipboardEvent('copy', { bubbles: true, cancelable: true })
      nativeInput.dispatchEvent(copy)

      equal(copy.defaultPrevented, false, 'editor intercepted copy from an iframe form control')
    } finally {
      editor?.destroy()
      iframe.remove()
    }
  })

  test('HTML paste routing parses elements in the supplied owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      let seenElement = null
      const plugin = {
        type: 'probe',
        pasteConfig: { tags: ['figure'] },
        onPaste({ element }) {
          seenElement = element
          return { value: element.textContent || '' }
        },
      }
      const parts = prepareHtmlPaste('<figure>probe</figure>', {
        router: new PasteRouter([plugin]),
        defaultBlockType: 'paragraph',
        ownerDocument: doc,
      })

      equal(parts.length, 1)
      assert(seenElement instanceof view.HTMLElement, 'paste parser escaped the supplied owning realm')
      assert(!(seenElement instanceof window.HTMLElement), 'paste parser created plugin input in the ambient realm')
    } finally {
      iframe.remove()
    }
  })
}
