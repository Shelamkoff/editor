import { test, make, para, assert, equal } from './harness.js'
import { createSimpleInlineTool, toggleTag } from '../../../inline-tools/utils.js'
import { openTool } from './formatting-fixture.js'

export function register() {
  for (const [tool, tag] of [['bold','b'],['italic','i'],['strikethrough','s'],['code','code'],['marker','mark']]) {
    test(`${tool} does not unwrap a widget-owned ${tag} node or remove its listener`, async () => {
      const plugin = {
        type: 'ownedFormat', title: 'Owned format', icon: '',
        createWidget(data, id) {
          const widget = document.createElement('span')
          widget.dataset.inlinePlugin = 'ownedFormat'; widget.dataset.id = id; widget.dataset.value = data.value
          widget.contentEditable = 'false'
          const child = document.createElement(tag); child.textContent = 'Widget'; widget.appendChild(child)
          return widget
        },
        hydrate(widget) { widget.firstElementChild.addEventListener('click', () => { widget.dataset.clicks = String(+(widget.dataset.clicks || 0) + 1) }) },
        getData(widget) { return { value: widget.dataset.value } },
      }
      const inline = { w: { type: 'ownedFormat', data: { value: '42' } } }
      const editor = make([para('a', `<${tag}>A</${tag}>{{w}}B`, { inline })], { inlinePlugins: [plugin], inlineTools: [tool] })
      const field = editor.blocks.getBlockById('a').contentElement
      const widget = field.querySelector('[data-inline-plugin]'), child = widget.firstElementChild
      const before = editor.save().blocks
      field.focus(); const range = document.createRange(); range.selectNodeContents(field)
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
      await openTool(editor, tool)
      equal(editor.save().blocks[0].data.text, 'A{{w}}B', 'authored formatting must actually be removed')
      equal(editor.save().blocks[0].inline, inline)
      assert(widget.firstElementChild === child, 'widget-owned element was unwrapped')
      child.click(); equal(widget.dataset.clicks, '1')
      editor.undo(); equal(editor.save().blocks, before)
    })
  }
  test('tag state and mutations ignore a selection inside an atomic widget', () => {
    const field = document.createElement('p'); field.contentEditable = 'true'
    field.innerHTML = '<span data-inline-plugin="owned" contenteditable="false"><b>Widget</b></span>'
    document.body.appendChild(field)
    try {
      const bold = field.querySelector('b'), range = document.createRange()
      range.setStart(bold.firstChild, 1); range.setEnd(bold.firstChild, 3)
      const tool = createSimpleInlineTool('bold', 'Bold', '', 'b')
      equal(tool.isActive({range}), false)
      toggleTag('b', range)
      assert(field.querySelector('b') === bold)
    } finally { field.remove() }
  })
}
