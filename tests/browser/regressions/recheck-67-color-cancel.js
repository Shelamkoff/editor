import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, equal, assert, pause } from './harness.js'

function fixture(value) {
  const editor = make([para('a', 'A{{w}}Z', { inline: { w: { type: 'color', data: { value } } } })], { inlinePlugins: [createColorSwatchPlugin()] })
  const field = editor.blocks.getBlockById('a').contentElement
  const widget = field.querySelector('[data-inline-plugin]')
  return { editor, field, widget }
}
function cancel() { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) }
function preview(editor, value) {
  const input = editor.rootElement.querySelector('.oe-ip-popup input')
  assert(input, 'real picker input exists')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
export function register() {
  for (const value of ['#ff000080', 'rgba(12, 34, 56, 0.25)', 'hsla(120, 100%, 50%, 0.3)', '#123456', 'rebeccapurple']) {
    for (const change of [false, true]) {
      test(`color Cancel restores exact ${value}${change ? ' after preview' : ''}`, async () => {
        const { editor, field, widget } = fixture(value)
        const before = editor.save().blocks
        const style = widget.querySelector('.oe-ip__dot').style.backgroundColor
        widget.click(); await pause(30); assert(editor.rootElement.querySelector('.oe-ip-popup'))
        if (change) preview(editor, 'rgba(40, 50, 60, 0.2)')
        cancel(); await pause(); assert(!editor.rootElement.querySelector('.oe-ip-popup'), 'popup really closes')
        equal(widget.dataset.value, value)
        equal(widget.querySelector('.oe-ip__dot').style.backgroundColor, style)
        equal(widget.querySelector('.oe-ip__label').textContent, value)
        equal(editor.save().blocks, before)
        equal(editor.canUndo, false)
        // Force serialization after a real document mutation, not a cached save.
        field.appendChild(document.createTextNode('X'))
        field.dispatchEvent(new InputEvent('input', { bubbles: true }))
        equal(Object.values(editor.save().blocks[0].inline).map(entry => entry.data.value), [value])
      })
    }
  }
  test('transparent color Apply preserves alpha and undoes to the exact original value', async () => {
    const { editor, widget } = fixture('#ff000080')
    const before = editor.save().blocks
    widget.click(); await pause(30)
    equal(editor.rootElement.querySelector('.oe-color-alpha').getAttribute('aria-valuenow'), '50')
    preview(editor, 'rgba(40, 50, 60, 0.2)')
    editor.rootElement.querySelector('.oe-color-btn--apply').click()
    equal(Object.values(editor.save().blocks[0].inline).map(entry => entry.data.value), ['rgba(40, 50, 60, 0.2)'])
    editor.undo(); equal(editor.save().blocks, before)
    editor.redo(); equal(Object.values(editor.save().blocks[0].inline).map(entry => entry.data.value), ['rgba(40, 50, 60, 0.2)'])
  })
}
