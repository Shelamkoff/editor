import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, key, assert, equal } from './harness.js'

function makeEditor(marker) {
  const plugin = {
    type: 'auxiliary-history-probe', title: 'Fields', icon: '',
    render(data, { ownerDocument }) {
      const root = ownerDocument.createElement('div')
      const text = ownerDocument.createElement('div')
      text.contentEditable = 'true'
      text.textContent = data.text || 'Keep'
      root.appendChild(text)
      for (const tag of ['input', 'textarea', 'select']) {
        const field = ownerDocument.createElement(tag)
        if (marker !== undefined) field.setAttribute('data-oe-document-input', marker)
        if (tag === 'select') {
          const option = ownerDocument.createElement('option')
          option.textContent = 'local choice'
          field.appendChild(option)
        } else field.value = 'local draft'
        root.appendChild(field)
      }
      return root
    },
    save(root) { return { text: root.firstElementChild.textContent } },
  }
  return make([{ id: 'fields', type: plugin.type, data: { text: 'Keep' } }], {
    plugins: [new Paragraph(), plugin],
  })
}

export function register() {
  test('auxiliary fields nested in a block retain native history without changing editor stacks', () => {
    const editor = makeEditor()
    editor.blocks.insert('paragraph', { text: 'committed' })
    const before = editor.save().blocks
    assert(editor.canUndo)
    for (const tag of ['input', 'textarea', 'select']) {
      const field = editor.blocks.getBlockById('fields').contentElement.querySelector(tag)
      field.focus()
      equal(key(field, 'z', { code: 'KeyZ', ctrlKey: true }).defaultPrevented, false, tag + ' Undo was intercepted')
      equal(editor.save().blocks, before)
    }
    assert(editor.undo(), 'the editor commit must remain available after native shortcuts')
    const undone = editor.save().blocks
    assert(editor.canRedo)
    for (const tag of ['input', 'textarea', 'select']) {
      const field = editor.blocks.getBlockById('fields').contentElement.querySelector(tag)
      field.focus()
      equal(key(field, 'z', { code: 'KeyZ', ctrlKey: true, shiftKey: true }).defaultPrevented, false)
      equal(key(field, 'y', { code: 'KeyY', ctrlKey: true }).defaultPrevented, false)
      equal(editor.save().blocks, undone)
      assert(editor.canRedo)
    }
  })

  test('explicit document-backed fields continue to use editor Undo and Redo', () => {
    for (const marker of ['', 'history', 'value']) {
      const editor = makeEditor(marker)
      editor.blocks.insert('paragraph', { text: 'committed' })
      const before = editor.save().blocks
      let field = editor.blocks.getBlockById('fields').contentElement.querySelector('textarea')
      field.focus()
      equal(key(field, 'z', { code: 'KeyZ', ctrlKey: true }).defaultPrevented, true)
      equal(editor.save().blocks.length, 1)
      field = editor.blocks.getBlockById('fields').contentElement.querySelector('textarea')
      field.focus()
      equal(key(field, 'z', { code: 'KeyZ', ctrlKey: true, shiftKey: true }).defaultPrevented, true)
      equal(editor.save().blocks, before)
    }
  })
}
