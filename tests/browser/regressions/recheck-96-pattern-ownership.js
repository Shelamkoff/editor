import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Code } from '../../../plugins/code/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, select, paste, key, assert, equal } from './harness.js'

export function register() {
  test('automatic inline patterns leave pasted Code source literal', async () => {
    const editor = make([para('a', '')], {
      plugins: [new Paragraph(), new Code()], inlinePlugins: [createColorSwatchPlugin()],
    })
    const before = editor.save().blocks
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 0)
    await paste(field, { 'text/html': '<pre>#ff0000</pre><p>#00ff00 tail</p>' })
    const code = [...editor.blocks].find(block => block.type === 'code')
    assert(code, 'HTML paste must route pre to Code')
    equal(code.contentElement.querySelectorAll('[data-inline-plugin]').length, 0)
    const saved = editor.save().blocks
    equal(saved.find(block => block.type === 'code').data.code, '#ff0000')
    assert(saved.some(block => block.type === 'paragraph' && block.inline), 'authored paragraph patterns must still be converted')
    const after = editor.save().blocks
    editor.undo(); equal(editor.save().blocks, before)
    editor.redo(); equal(editor.save().blocks, after)
  })

  test('automatic inline patterns do not convert plugin labels or locked descendants', async () => {
    const plugin = {
      type: 'pattern-ownership', title: 'Probe', icon: '',
      render(data, { ownerDocument }) {
        const root = ownerDocument.createElement('div')
        const label = ownerDocument.createElement('span')
        label.className = 'probe-label'; label.textContent = '#ff0000'
        const field = ownerDocument.createElement('div')
        field.contentEditable = 'true'; field.textContent = data.text || 'start '
        const locked = ownerDocument.createElement('span')
        locked.contentEditable = 'false'; locked.textContent = '#0000ff'; locked.className = 'probe-locked'
        field.append(locked)
        root.append(label, field)
        return root
      },
      save(root) { return { text: root.querySelector('[contenteditable="true"]').innerHTML } },
      mapTextFields(data, transform) { data.text = transform(data.text) },
    }
    const editor = make([{ id: 'a', type: plugin.type, data: { text: 'start ' } }], {
      plugins: [new Paragraph(), plugin], inlinePlugins: [createColorSwatchPlugin()],
    })
    const root = editor.blocks.getBlockById('a').contentElement
    const field = root.querySelector('[contenteditable="true"]')
    select(field, 6)
    await paste(field, { 'text/plain': '#00ff00 tail ' })
    equal(root.querySelector('.probe-label').textContent, '#ff0000')
    equal(root.querySelector('.probe-label').querySelectorAll('[data-inline-plugin]').length, 0)
    equal(root.querySelector('.probe-locked').textContent, '#0000ff')
    equal(root.querySelector('.probe-locked').querySelectorAll('[data-inline-plugin]').length, 0)
    equal(field.querySelectorAll('[data-inline-plugin]').length, 1)
  })

  test('keyboard patterns require a block inline serialization contract', () => {
    const plugin = {
      type: 'plain-pattern-source', title: 'Plain source', icon: '',
      render(data, { ownerDocument }) {
        const field = ownerDocument.createElement('div')
        field.contentEditable = 'true'; field.textContent = data.text
        return field
      },
      save(field) { return { text: field.textContent } },
    }
    const editor = make([{ id: 'a', type: plugin.type, data: { text: '#ff0000' } }], {
      plugins: [new Paragraph(), plugin], inlinePlugins: [createColorSwatchPlugin()],
    })
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 7)
    assert(!key(field, ' ').defaultPrevented, 'literal source must retain native space handling')
    equal(field.querySelectorAll('[data-inline-plugin]').length, 0)
  })
}
