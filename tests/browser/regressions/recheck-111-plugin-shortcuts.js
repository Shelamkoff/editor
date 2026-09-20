import { test, make, para, select, key, equal } from './harness.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'

function shortcutPlugin(type, calls, combo = 'Mod+Shift+K') {
  return {
    type, title: type, icon: '', inlineTools: false,
    render(data, context) {
      const element = context.ownerDocument.createElement('p')
      element.contentEditable = 'true'
      element.textContent = data.text ?? ''
      return element
    },
    save(element) { return { text: element.textContent } },
    shortcuts: [{ combo, handler(element) { calls.push(type); element.textContent += `:${type}` } }],
  }
}

function trigger(editor, id, name = 'k', options = {}) {
  const element = editor.blocks.getBlockById(id).contentElement
  select(element, 0)
  return key(element, name, { code: 'KeyK', ctrlKey: true, shiftKey: true, ...options })
}

export function register() {
  test('a block plugin shortcut neither mutates nor consumes keys in another block type', () => {
    const calls = []
    const editor = make([para('p', 'P')], { plugins: [new Paragraph(), shortcutPlugin('code', calls)] })
    equal(trigger(editor, 'p').defaultPrevented, false)
    equal(editor.save().blocks[0].data.text, 'P')
    equal(calls, [])
    equal(editor.canUndo, false)
  })

  test('equal shortcuts resolve per block type and produce one undoable mutation', () => {
    const calls = []
    const editor = make([para('p', 'P'), { id: 'c', type: 'code', data: { text: 'C' } }], {
      plugins: [shortcutPlugin('paragraph', calls), shortcutPlugin('code', calls)],
    })
    equal(trigger(editor, 'p').defaultPrevented, true)
    equal(editor.save().blocks.map(block => block.data.text), ['P:paragraph', 'C'])
    editor.undo()
    equal(editor.save().blocks.map(block => block.data.text), ['P', 'C'])
    editor.redo()
    equal(editor.save().blocks.map(block => block.data.text), ['P:paragraph', 'C'])
    trigger(editor, 'c')
    equal(editor.save().blocks.map(block => block.data.text), ['P:paragraph', 'C:code'])
    editor.undo()
    equal(editor.save().blocks.map(block => block.data.text), ['P:paragraph', 'C'])
    equal(calls, ['paragraph', 'code'])
  })

  test('a content plugin using Mod+Z cannot displace editor Undo', () => {
    const calls = []
    const editor = make([para('p', 'P')], {
      plugins: [new Paragraph(), shortcutPlugin('code', calls, 'Mod+Z')],
    })
    const added = editor.blocks.insert('paragraph', { text: 'ADDED' })
    equal(editor.save().blocks.length, 2)
    equal(trigger(editor, added.id, 'z', { code: 'KeyZ', shiftKey: false }).defaultPrevented, true)
    equal(editor.save().blocks.map(block => block.data.text), ['P'])
    equal(calls, [])
    editor.redo()
    equal(editor.save().blocks.map(block => block.data.text), ['P', 'ADDED'])
  })

  test('mode reconstruction does not duplicate block shortcut handlers', () => {
    const calls = []
    const editor = make([para('p', 'P')], { plugins: [shortcutPlugin('paragraph', calls)] })
    editor.setReadOnly(true)
    editor.setReadOnly(false)
    trigger(editor, 'p')
    equal(calls, ['paragraph'])
    equal(editor.save().blocks[0].data.text, 'P:paragraph')
    editor.undo()
    equal(editor.save().blocks[0].data.text, 'P')
    editor.redo()
    equal(editor.save().blocks[0].data.text, 'P:paragraph')
  })
}
