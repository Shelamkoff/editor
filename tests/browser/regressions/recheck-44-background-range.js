import { test, make, para, equal, assert } from './harness.js'
import { textRange, characterStyles, backgroundAction, backgroundAt } from './formatting-fixture.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'

export function register() {
  for (const remove of [false, true]) {
    test(`background ${remove ? 'removal' : 'application'} keeps the unselected edges colored`, async () => {
      const html = '<span style="background-color: rgb(255, 0, 0);">ABC</span>'
      const editor = make([para('a', html)], { inlineTools: ['bgcolor'] })
      const field = editor.blocks.getBlockByIndex(0).contentElement
      textRange(field.firstChild.firstChild, 1, field.firstChild.firstChild, 2)
      await backgroundAction(editor, remove)
      equal(characterStyles(field, backgroundAt), [['A', 'rgb(255, 0, 0)'], ['B', remove ? 'none' : 'rgb(0, 255, 0)'], ['C', 'rgb(255, 0, 0)']])
      equal(window.getSelection().toString(), 'B')
      const result = editor.save().blocks[0].data.text
      editor.undo(); equal(editor.save().blocks[0].data.text, html)
      editor.redo(); equal(editor.save().blocks[0].data.text, result)
    })
  }
  test('background removal preserves other properties and formatting of nested selected text', async () => {
    const editor = make([para('a', '<span style="background-color:red;font-size:20px">A<i>BC</i>D</span>')], { inlineTools: ['bgcolor'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    textRange(field.querySelector('i').firstChild, 0, field.querySelector('i').firstChild, 1)
    await backgroundAction(editor, true)
    equal(characterStyles(field, backgroundAt), [['A', 'red'], ['B', 'none'], ['C', 'red'], ['D', 'red']])
    equal(characterStyles(field, element => getComputedStyle(element).fontSize), [['A', '20px'], ['B', '20px'], ['C', '20px'], ['D', '20px']])
    equal(characterStyles(field, element => !!element.closest('i')), [['A', false], ['B', true], ['C', true], ['D', false]])
  })
  test('removal clears all inherited background spans only in the selected fragment', async () => {
    const editor = make([para('a', '<span style="background-color:red">A<span style="background-color:blue">BC</span>D</span>')], { inlineTools: ['bgcolor'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    const inner = field.querySelector('span span')
    textRange(inner.firstChild, 0, inner.firstChild, 1)
    await backgroundAction(editor, true)
    equal(characterStyles(field, backgroundAt), [['A', 'red'], ['B', 'none'], ['C', 'blue'], ['D', 'red']])
  })
  test('removing background across spans clips both boundary wrappers', async () => {
    const editor = make([para('a', '<span style="background-color:red">AB</span><span style="background-color:blue">CD</span>')], { inlineTools: ['bgcolor'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    textRange(field.firstChild.firstChild, 1, field.lastChild.firstChild, 1)
    await backgroundAction(editor, true)
    equal(characterStyles(field, backgroundAt), [['A', 'red'], ['B', 'none'], ['C', 'none'], ['D', 'blue']])
    equal(window.getSelection().toString(), 'BC')
  })
  test('removing neighboring text background leaves an atomic color widget untouched', async () => {
    const inline = { w: { type: 'color', data: { value: '#ff0000' } } }
    const editor = make([para('a', '<span style="background-color:red">A{{w}}B</span>', { inline })], { inlineTools: ['bgcolor'], inlinePlugins: [createColorSwatchPlugin()] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    const widget = field.querySelector('[data-inline-plugin]'); const dot = widget.firstChild
    textRange(field.firstChild.firstChild, 0, field.firstChild.firstChild, 1)
    await backgroundAction(editor, true)
    assert(field.contains(widget) && widget.contains(dot))
    equal(getComputedStyle(dot).backgroundColor, 'rgb(255, 0, 0)')
    equal(editor.save().blocks[0].inline, inline)
    widget.click(); assert(editor.rootElement.querySelector('.oe-ip-popup'))
  })
}
