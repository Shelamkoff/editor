import { test, make, para, assert, equal, pause } from './harness.js'
import { openTool } from './formatting-fixture.js'
import { createLinkTool } from '../../../inline-tools/link.js'

const widgetPlugin = {
  type: 'atomicLink', title: 'Profile', icon: '',
  createWidget(data, id) {
    const root = document.createElement('span')
    root.dataset.inlinePlugin = 'atomicLink'; root.dataset.id = id; root.dataset.value = data.value
    root.contentEditable = 'false'
    const link = document.createElement('a'); link.href = 'https://example.test/profile'; link.textContent = 'Anna'
    root.appendChild(link); return root
  },
  hydrate(root) { root.firstChild.addEventListener('click', event => { event.preventDefault(); root.dataset.clicks = String(+(root.dataset.clicks || 0) + 1) }) },
  getData(root) { return { value: root.dataset.value } },
}
function contents(field) {
  field.focus(); const range = document.createRange(); range.selectNodeContents(field)
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
  return range
}
export function register() {
  test('Unlink changes authored links without unwrapping atomic widget links or losing handlers', async () => {
    const inline = { w: { type: 'atomicLink', data: { value: '42' } } }
    const editor = make([para('a', '<a href="https://example.test/a">A</a>{{w}}<a href="https://example.test/b">B</a>', { inline })], { inlinePlugins: [widgetPlugin], inlineTools: ['link'] })
    const field = editor.blocks.getBlockById('a').contentElement
    const widget = field.querySelector('[data-inline-plugin]'), link = widget.querySelector('a')
    const before = editor.save().blocks
    contents(field); await openTool(editor, 'link')
    equal([...field.querySelectorAll('a')], [link], 'only widget-owned links remain')
    equal(field.querySelector('[data-inline-plugin]'), widget)
    link.click(); equal(widget.dataset.clicks, '1')
    const after = editor.save().blocks
    equal(after[0].data.text, 'A{{w}}B'); equal(after[0].inline, inline)
    editor.undo(); equal(editor.save().blocks, before)
    editor.redo(); equal(editor.save().blocks, after)
  })
  test('a range containing only a widget link does not report authored link formatting', () => {
    const editor = make([para('a', '{{w}}', { inline: { w: { type: 'atomicLink', data: { value: '42' } } } })], { inlinePlugins: [widgetPlugin] })
    const field = editor.blocks.getBlockById('a').contentElement
    const range = contents(field)
    equal(createLinkTool('URL', 'Link').isActive({ range }), false)
  })
  test('caret fallback ignores a hyperlink inside an atomic widget', () => {
    const editor = make([para('a', '{{w}}', { inline: { w: { type: 'atomicLink', data: { value: '42' } } } })], { inlinePlugins: [widgetPlugin] })
    const link = editor.blocks.getBlockById('a').contentElement.querySelector('a')
    const range = document.createRange(); range.setStart(link.firstChild, 1); range.collapse(true)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    equal(createLinkTool('URL', 'Link').isActive(null), false)
  })
  test('ordinary link formatting still reports active and can be removed', async () => {
    const editor = make([para('a', '<a href="https://example.test/">ABC</a>')], { inlineTools: ['link'] })
    const field = editor.blocks.getBlockById('a').contentElement
    const range = contents(field)
    equal(createLinkTool('URL', 'Link').isActive({ range }), true)
    await openTool(editor, 'link')
    equal(editor.save().blocks[0].data.text, 'ABC')
    equal(field.querySelector('a'), null)
  })
}
