import { test, equal, assert } from './harness.js'
import { createEditor } from '../../../core/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { sanitizeRawHtml } from '../../../shared/sanitize/sanitizeRawHtml.js'
import { escapeHtml } from '../../../shared/sanitize/escapeHtml.js'

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

  test('inline toolbar construction does not borrow the ambient document', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let editor = null
    try {
      const doc = iframe.contentDocument
      assert(doc, 'iframe document unavailable')
      const holder = doc.createElement('div')
      doc.body.appendChild(holder)
      const ambientCreateElement = document.createElement
      document.createElement = () => { throw new Error('ambient document must not be used') }
      try {
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
      } finally {
        document.createElement = ambientCreateElement
      }
      const toolbar = editor.rootElement.querySelector('.oe-inline-toolbar')
      assert(toolbar, 'inline toolbar exists')
      equal(toolbar.ownerDocument, doc, 'inline toolbar escaped the editor document')
    } finally {
      editor?.destroy()
      iframe.remove()
    }
  })

  test('raw and text sanitizers do not borrow the ambient document', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      assert(doc, 'iframe document unavailable')
      const ambientCreateElement = document.createElement
      document.createElement = () => { throw new Error('ambient document must not be used') }
      try {
        equal(escapeHtml('<&>'), '&lt;&amp;&gt;', 'text escaping changed')
        const sanitized = sanitizeRawHtml(
          '<p onclick="bad()" style="color: red">safe</p><script>bad()</script>',
          doc,
        )
        assert(sanitized.includes('<p'), 'safe Raw markup was removed')
        assert(sanitized.includes('safe'), 'safe Raw text was removed')
        assert(!sanitized.includes('onclick'), 'Raw event handler survived sanitization')
        assert(!sanitized.includes('<script'), 'Raw script survived sanitization')
      } finally {
        document.createElement = ambientCreateElement
      }
    } finally {
      iframe.remove()
    }
  })


  test('editor history and change debounce use the editor owning window timers', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    let editor = null
    const ambientSetTimeout = window.setTimeout
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const holder = doc.createElement('div')
      doc.body.appendChild(holder)
      let ownerTimerCalls = 0
      const ownerSetTimeout = view.setTimeout
      view.setTimeout = function (...args) {
        ownerTimerCalls += 1
        return ownerSetTimeout.apply(this, args)
      }
      try {
        editor = createEditor({
          holder,
          injectStyles: false,
          plugins: [new Paragraph()],
          inlineTools: [],
          onChange() {},
          data: { version: '1', blocks: [{ id: 'a', type: 'paragraph', data: { text: 'A' } }] },
          tuning: {
            undo: { debounceMs: 10000 }, change: { debounceMs: 10000 },
            animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 0 },
            mobileBreakpoint: 1,
          },
        })
        const content = editor.rootElement.querySelector('[contenteditable="true"]')
        assert(content, 'editable paragraph unavailable')
        window.setTimeout = () => { throw new Error('ambient setTimeout must not be used') }
        content.textContent = 'AB'
        content.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'B' }))
        assert(ownerTimerCalls >= 2, 'history/change debounce did not use the owning window timers')
      } finally {
        view.setTimeout = ownerSetTimeout
      }
    } finally {
      window.setTimeout = ambientSetTimeout
      editor?.destroy()
      iframe.remove()
    }
  })

}
