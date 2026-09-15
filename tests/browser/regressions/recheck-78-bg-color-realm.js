import { test, equal, assert } from './harness.js'
import { createBgColorTool } from '../../../inline-tools/colorPicker.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'

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

      const ambientCreateElement = document.createElement
      document.createElement = () => { throw new Error('ambient ColorPicker document must not be used') }
      try {
        tool = createBgColorTool('Background')
        tool.onMount(button)
        tool.toggle({ range })
      } finally {
        document.createElement = ambientCreateElement
      }

      equal(tool.isDropdownOpen(), true, 'picker did not read the iframe selection')
      equal(window.getSelection().rangeCount, 0, 'ambient selection was mutated')
      const picker = toolbar.querySelector('.oe-color-dropdown')
      assert(picker, 'owning-realm background picker missing')
      equal(picker.ownerDocument, doc, 'background picker escaped the mounted toolbar document')

      const color = picker.querySelector('input[type="color"]')
      const apply = picker.querySelector('.oe-color-btn--apply')
      assert(color && apply, 'foreign-realm background picker controls missing')
      color.value = '#112233'
      color.dispatchEvent(new view.Event('input', { bubbles: true }))
      apply.click()
      assert(field.querySelector('span')?.style.backgroundColor, 'foreign-realm background picker did not apply the selected color')

      tool.toggle({ range })
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      equal(tool.isDropdownOpen(), true, 'ambient document closed the iframe picker')

      doc.body.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true }))
      equal(tool.isDropdownOpen(), false, 'owning document did not close the picker')
    } finally {
      tool?.destroy()
      iframe.remove()
    }
  })

  test('inline color widget picker never constructs UI in the ambient document', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const plugin = createColorSwatchPlugin()
    let popupContent = null
    let cleanup = null
    try {
      const doc = iframe.contentDocument
      const view = iframe.contentWindow
      assert(doc && view, 'iframe realm unavailable')
      const root = doc.createElement('div')
      doc.body.appendChild(root)
      plugin.mount?.(root, /** @type {any} */ ({}))
      const widget = plugin.createWidget({ value: '#123456' }, 'realm-color', { ownerDocument: doc })
      root.appendChild(widget)

      const ctx = {
        readOnly: false,
        showPopup(_anchor, content, onCleanup) {
          popupContent = content
          cleanup = onCleanup ?? null
          root.appendChild(content)
        },
        hidePopup() {
          cleanup?.()
          cleanup = null
          popupContent = null
        },
        mutate(_target, operation) { return operation() },
        notifyChanged() {},
      }
      plugin.hydrate(widget, ctx)

      const ambientCreateElement = document.createElement
      document.createElement = () => { throw new Error('ambient ColorPicker document must not be used') }
      try {
        widget.dispatchEvent(new view.MouseEvent('click', { bubbles: true }))
      } finally {
        document.createElement = ambientCreateElement
      }

      assert(popupContent, 'inline color picker did not open')
      equal(popupContent.ownerDocument, doc, 'inline color picker escaped the widget owning document')
      const color = popupContent.querySelector('input[type="color"]')
      const apply = popupContent.querySelector('.oe-color-btn--apply')
      assert(color && apply, 'foreign-realm inline color picker controls missing')
      color.value = '#445566'
      color.dispatchEvent(new view.Event('input', { bubbles: true }))
      apply.click()
      equal(widget.dataset.value, '#445566', 'foreign-realm inline color picker did not commit the selected color')
    } finally {
      cleanup?.()
      plugin.destroy?.()
      iframe.remove()
    }
  })
}
