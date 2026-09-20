import { rangeClipboardContent } from '../../../core/clipboard/rangeClipboard.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Quote } from '../../../plugins/quote/index.js'
import { test, make, para, equal, assert, key, select } from './harness.js'

const color = { type: 'color', data: { value: '#ff0000' } }
const options = () => ({ inlinePlugins: [createColorSwatchPlugin()] })
const changed = field => field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))

export function register() {
  for (const loaded of [false, true]) {
    test(`authored token next to a ${loaded ? 'loaded' : 'new'} color survives save/load and history`, () => {
      const plugin = createColorSwatchPlugin()
      const editor = make([para('a', loaded ? '{{w}}' : '', loaded ? { inline: { w: color } } : {})], { inlinePlugins: [plugin] })
      const field = editor.blocks.getBlockById('a').contentElement
      if (!loaded) field.appendChild(plugin.createWidget(color.data, 'w', { ownerDocument: document }))
      field.prepend(document.createTextNode('literal {{w}} / '))
      changed(field)
      const saved = editor.save()
      equal(Object.keys(saved.blocks[0].inline).length, 1)
      assert(saved.blocks[0].data.text.startsWith('literal {{w}} / '))
      assert(!Object.hasOwn(saved.blocks[0].inline, 'w'))
      editor.undo()
      editor.redo()
      equal(editor.save().blocks, saved.blocks)
      editor.render(saved)
      const reloaded = editor.blocks.getBlockById('a').contentElement
      equal(reloaded.querySelectorAll('[data-inline-plugin="color"]').length, 1)
      assert(reloaded.textContent.startsWith('literal {{w}} / '))
      for (let i = 0; i < 3; i++) editor.render(editor.save())
      equal(editor.blocks.getBlockById('a').contentElement.querySelectorAll('[data-inline-plugin="color"]').length, 1)
    })
  }

  for (const literalField of ['text', 'caption']) {
    test(`quote ${literalField} literal cannot become a sibling field's color`, () => {
      const widgetField = literalField === 'text' ? 'caption' : 'text'
      const editor = make([{ id: 'q', type: 'quote', data: { text: '', caption: '', [widgetField]: '{{w}}' }, inline: { w: color } }], {
        plugins: [new Paragraph(), new Quote()], ...options(),
      })
      const root = editor.blocks.getBlockById('q').contentElement
      const fields = root.querySelectorAll('[contenteditable="true"]')
      equal(fields.length, 2)
      const literal = fields[literalField === 'text' ? 0 : 1]
      literal.textContent = 'literal {{w}}'
      changed(literal)
      const saved = editor.save()
      assert(!Object.hasOwn(saved.blocks[0].inline, 'w'))
      editor.render(saved)
      equal(editor.blocks.getBlockById('q').contentElement.querySelectorAll('[data-inline-plugin="color"]').length, 1)
      equal(editor.save().blocks[0].data[literalField], 'literal {{w}}')
    })
  }

  test('deleting a hydrated widget cannot resurrect its old payload through authored text', () => {
    const editor = make([para('a', '{{w}}', { inline: { w: color } })], options())
    const field = editor.blocks.getBlockById('a').contentElement
    field.textContent = 'literal {{w}}'
    changed(field)
    const saved = editor.save()
    equal(saved.blocks[0].inline, undefined)
    editor.render(saved)
    equal(editor.blocks.getBlockById('a').contentElement.textContent, 'literal {{w}}')
    equal(editor.rootElement.querySelectorAll('[data-inline-plugin="color"]').length, 0)
  })

  test('opaque unknown references retain data and become widgets when their plugin returns', () => {
    const editor = make([para('a', 'before {{w}} after', { inline: { w: color } })])
    const saved = editor.save()
    equal(saved.blocks[0].inline, { w: color })
    editor.render(saved)
    equal(editor.save().blocks, saved.blocks)
    const available = make(saved.blocks, options())
    equal(available.rootElement.querySelectorAll('[data-inline-plugin="color"]').length, 1)
  })

  test('a merged live widget does not leave an opaque payload behind after deletion', () => {
    const editor = make([para('a', 'A'), para('b', '{{w}}', { inline: { w: color } })], options())
    const right = editor.blocks.getBlockById('b').contentElement
    select(right, 0)
    key(right, 'Backspace')
    equal(editor.save().blocks.length, 1)
    const field = editor.blocks.getBlockByIndex(0).contentElement
    const id = field.querySelector('[data-inline-plugin="color"]').getAttribute('data-id')
    field.textContent = `literal {{${id}}}`
    changed(field)
    const saved = editor.save()
    equal(saved.blocks[0].inline, undefined)
    editor.render(saved)
    equal(editor.rootElement.querySelectorAll('[data-inline-plugin="color"]').length, 0)
  })

  test('registered plugin hydration failure keeps its opaque payload beside a new live widget', () => {
    const plugin = createColorSwatchPlugin()
    const createWidget = plugin.createWidget.bind(plugin)
    plugin.createWidget = (data, id, context) => {
      if (data.value === 'legacy') throw new Error('unsupported legacy value')
      return createWidget(data, id, context)
    }
    const legacy = { type: 'color', data: { value: 'legacy' } }
    const editor = make([para('a', '{{w}} / ', { inline: { w: legacy } })], { inlinePlugins: [plugin] })
    const field = editor.blocks.getBlockById('a').contentElement
    field.appendChild(plugin.createWidget(color.data, 'w', { ownerDocument: document }))
    changed(field)
    const saved = editor.save()
    equal(saved.blocks[0].inline.w, legacy)
    equal(Object.keys(saved.blocks[0].inline).length, 2)
    const range = document.createRange()
    range.selectNodeContents(field)
    const fragment = JSON.parse(rangeClipboardContent(range, saved.blocks, new Map([['color', plugin]])).fragment)
    equal(Object.values(fragment.inline).filter(ref => ref.data.value === 'legacy').length, 1)
    equal(Object.keys(fragment.inline).length, 2)
    editor.render(saved)
    equal(editor.blocks.getBlockById('a').contentElement.querySelectorAll('[data-inline-plugin="color"]').length, 1)
    equal(editor.save().blocks[0].inline.w, legacy)
  })

}
