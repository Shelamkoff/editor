import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, key, assert, equal } from './harness.js'

function unbold(field) {
  field.focus()
  const range = document.createRange(); range.selectNodeContents(field.querySelector('b'))
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
  key(field, 'b', { ctrlKey: true, code: 'KeyB' })
}
const icon = {
  type: 'icon', title: 'Icon', icon: '',
  createWidget(data, id) {
    const node = document.createElement('span')
    node.dataset.inlinePlugin = 'icon'; node.dataset.id = id; node.dataset.value = data.value
    node.contentEditable = 'false'; node.setAttribute('aria-label', data.value)
    node.style.cssText = 'display:inline-block;width:16px;height:16px;background:red'
    node.innerHTML = '<span class="icon-decoration"></span>'
    return node
  },
  hydrate(node) { node.addEventListener('click', () => { node.dataset.clicks = String(+(node.dataset.clicks || 0) + 1) }) },
  getData(node) { return { value: node.dataset.value } },
}

export function register() {
  test('unbolding neighboring text preserves the built-in color indicator and live listener', () => {
    const editor = make([para('a', '<b>A</b>{{w}}B', { inline: { w: { type: 'color', data: { value: '#ff0000' } } } })], {
      inlineTools: ['bold'], inlinePlugins: [createColorSwatchPlugin()],
    })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    const widget = field.querySelector('[data-inline-plugin]'); const dot = widget.querySelector('.oe-ip__dot')
    unbold(field)
    assert(widget.contains(dot), 'a non-text visual part belongs to the widget')
    equal(getComputedStyle(dot).backgroundColor, 'rgb(255, 0, 0)')
    widget.click(); assert(editor.rootElement.querySelector('.oe-ip-popup'), 'live widget should still open')
  })
  for (const wrapper of ['', 'i']) {
    test(`empty-tag cleanup preserves icon-only widgets${wrapper ? ' and enclosing formatting' : ''}`, () => {
      const token = wrapper ? '<i>{{w}}</i>' : '{{w}}'
      const inline = { w: { type: 'icon', data: { value: 'Important' } } }
      const editor = make([para('a', `<b>A</b>${token}B`, { inline })], { inlineTools: ['bold'], inlinePlugins: [icon] })
      const field = editor.blocks.getBlockByIndex(0).contentElement
      const widget = field.querySelector('[data-inline-plugin]'); const decoration = widget.firstChild
      unbold(field)
      assert(field.contains(widget), 'widget root must remain in authored content')
      assert(widget.contains(decoration), 'cleanup must not traverse widget internals')
      if (wrapper) assert(widget.closest(wrapper), 'wrapper around an atomic widget is not empty')
      equal(editor.save().blocks[0].inline, inline)
      widget.click(); equal(widget.dataset.clicks, '1')
      editor.undo(); equal(editor.save().blocks[0].inline, inline)
      editor.redo(); equal(editor.save().blocks[0].inline, inline)
    })
  }
  test('unbolding text before an icon-only suffix preserves its atomic content', () => {
    const inline = { w: { type: 'icon', data: { value: 'Important' } } }
    const editor = make([para('a', '<b>A{{w}}</b>B', { inline })], { inlineTools: ['bold'], inlinePlugins: [icon] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    field.focus(); const range = document.createRange(); range.setStart(field.firstChild.firstChild, 0); range.setEnd(field.firstChild.firstChild, 1)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    key(field, 'b', { ctrlKey: true, code: 'KeyB' })
    equal(editor.save().blocks[0].inline, inline)
    assert(field.querySelector('[data-inline-plugin] .icon-decoration'))
  })
}
