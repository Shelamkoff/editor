import { test, equal, assert } from './harness.js'
import { pastePlainText, pastePreparedHtml } from '../../../core/clipboard/pasteInsert.js'

function setCaret(doc, view, field, offset) {
  const text = field.firstChild
  const range = doc.createRange()
  range.setStart(text, offset)
  range.collapse(true)
  const selection = view.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

export function register() {
  test('plain-text paste inserts at the caret in the owning realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const field = doc.createElement('p')
      field.contentEditable = 'true'
      field.textContent = 'AB'
      doc.body.appendChild(field)
      setCaret(doc, view, field, 1)
      window.getSelection().removeAllRanges()

      const block = { contentElement: field }
      pastePlainText('x', {
        blocks: { getCurrentBlock: () => block },
        notifyChanged() {},
      })

      equal(field.textContent, 'AxB')
      equal(window.getSelection().rangeCount, 0, 'ambient selection was mutated')
    } finally {
      iframe.remove()
    }
  })

  test('HTML paste inserts into the owning document selection', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const field = doc.createElement('p')
      field.contentEditable = 'true'
      field.textContent = 'AB'
      doc.body.appendChild(field)
      setCaret(doc, view, field, 1)
      window.getSelection().removeAllRanges()

      const block = { contentElement: field }
      pastePreparedHtml([
        { tag: 'p', type: 'paragraph', data: { text: '<b>x</b>' }, routed: false },
      ], {
        blocks: { getCurrentBlock: () => block },
        notifyChanged() {},
      })

      equal(field.innerHTML, 'A<b>x</b>B')
      equal(field.querySelector('b').ownerDocument, doc)
      equal(window.getSelection().rangeCount, 0, 'ambient selection was mutated')
    } finally {
      iframe.remove()
    }
  })
}
