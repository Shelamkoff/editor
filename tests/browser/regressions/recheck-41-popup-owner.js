import { Paragraph, Heading } from '../../../plugins/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, assert, equal, pause } from './harness.js'

export function register() {
  for (const operation of ['render', 'undo', 'remove', 'convert']) {
    test(`popup closes when ${operation} replaces its widget owner`, async () => {
      const editor = make([para('a', 'A{{w}}B', { inline: { w: { type: 'color', data: { value: '#ff0000' } } } })], {
        plugins: [new Paragraph(), new Heading()], inlinePlugins: [createColorSwatchPlugin()],
      })
      if (operation === 'undo') editor.blocks.insert('paragraph', { text: 'After' })
      const widget = editor.blocks.getBlockById('a').contentElement.querySelector('[data-inline-plugin]')
      widget.click(); assert(editor.rootElement.querySelector('.oe-ip-popup'))
      if (operation === 'render') editor.render({ version: '1', blocks: [para('a', 'New')] })
      if (operation === 'undo') editor.undo()
      if (operation === 'remove') editor.blocks.remove(0)
      if (operation === 'convert') editor.blocks.convert(0, 'heading')
      await pause()
      equal(editor.rootElement.querySelectorAll('.oe-ip-popup').length, 0)
      widget.click(); await pause()
      equal(editor.rootElement.querySelectorAll('.oe-ip-popup').length, 0, 'late callbacks must not reopen a retired owner')
    })
  }
  test('an unrelated edit and a live block move do not close a valid popup', async () => {
    const editor = make([para('a', '{{w}}', { inline: { w: { type: 'color', data: { value: '#ff0000' } } } }), para('b', 'B')], { inlinePlugins: [createColorSwatchPlugin()] })
    editor.blocks.getBlockById('a').contentElement.querySelector('[data-inline-plugin]').click()
    const popup = editor.rootElement.querySelector('.oe-ip-popup')
    editor.blocks.insert('paragraph', { text: 'C' }); editor.blocks.move(0, 3)
    await pause()
    assert(popup && editor.rootElement.contains(popup))
  })
  test('detaching a popup anchor releases its cleanup exactly once', async () => {
    let cleaned = 0
    const plugin = createColorSwatchPlugin()
    plugin.type = 'owned-popup'
    const baseCreate = plugin.createWidget
    plugin.createWidget = (data, id) => { const widget = baseCreate(data, id); widget.dataset.inlinePlugin = plugin.type; return widget }
    plugin.hydrate = (widget, ctx) => widget.addEventListener('click', () => {
      ctx.showPopup(widget, document.createElement('div'), () => { cleaned++ })
    })
    const editor = make([para('a', '{{w}}', { inline: { w: { type: plugin.type, data: { value: '#ff0000' } } } })], { inlinePlugins: [plugin] })
    const widget = editor.blocks.getBlockById('a').contentElement.querySelector('[data-inline-plugin]')
    widget.click(); widget.remove(); await pause()
    equal(cleaned, 1)
    equal(editor.rootElement.querySelectorAll('.oe-ip-popup').length, 0)
    editor.destroy(); equal(cleaned, 1)
  })
}
