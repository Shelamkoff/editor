import { Table } from '../../../plugins/table/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { EditorRenderer } from '../../../renderer/index.js'
import { test, make, equal, assert } from './harness.js'

export function register() {
  const cases = [
    ['later row wider than the first', [['A'], ['B', 'C']], [['A', ''], ['B', 'C']]],
    ['widest middle row', [['A'], ['B', 'C', 'D'], ['E', 'F']], [['A', '', ''], ['B', 'C', 'D'], ['E', 'F', '']]],
    ['empty leading row', [[], ['A'], ['B', 'C']], [['', ''], ['A', ''], ['B', 'C']]],
    ['already rectangular', [['A', 'B'], ['C', 'D']], [['A', 'B'], ['C', 'D']]],
    ['short later row', [['A', 'B'], ['C']], [['A', 'B'], ['C', '']]],
  ]
  for (const [name, content, want] of cases) {
    test(`Table load preserves all cells: ${name}`, () => {
      const original = JSON.stringify(content)
      const editor = make([{ id: 't', type: 'table', data: { content, withHeadings: true } }], {
        plugins: [new Paragraph(), new Table()],
      })
      const saved = editor.save()
      equal(saved.blocks[0].data.content, want)
      equal(JSON.stringify(content), original, 'caller data changed')
      equal(saved.blocks[0].data.withHeadings, true)
      editor.render(saved)
      equal(editor.save().blocks, saved.blocks, 'save/load changed the repaired grid')
      editor.setReadOnly(true)
      equal(editor.save().blocks, saved.blocks)
      editor.setReadOnly(false)
      equal(editor.save().blocks, saved.blocks)
    })
  }

  test('Table loading an uneven grid retains a widget in a wider row', () => {
    const editor = make([{ id: 't', type: 'table', data: { content: [['A'], ['B', '{{color}}']] },
      inline: { color: { type: 'color', data: { value: '#ff0000' } } } }], {
      plugins: [new Paragraph(), new Table()], inlinePlugins: [createColorSwatchPlugin()],
    })
    const saved = editor.save()
    equal(saved.blocks[0].data.content, [['A', ''], ['B', '{{color}}']])
    equal(saved.blocks[0].inline, { color: { type: 'color', data: { value: '#ff0000' } } })
    equal(editor.blocks.getBlockById('t').contentElement.querySelectorAll('[data-inline-plugin="color"]').length, 1)
    editor.render(saved)
    equal(editor.save().blocks, saved.blocks)
  })

  test('Table editor and preserve-mode renderer retain the same repaired grid', () => {
    const input = { id: 't', type: 'table', data: { content: [['<b>A</b>'], ['B', '<em>C</em>']] } }
    const renderer = new EditorRenderer({ blockTypes: ['table'], injectStyles: false })
    const root = renderer.render({ blocks: [input] })
    try {
      const editor = make([input], { plugins: [new Paragraph(), new Table()] })
      const matrix = element => [...element.querySelectorAll('tr')].map(row => [...row.cells].map(cell => cell.textContent))
      equal(matrix(root), [['A', ''], ['B', 'C']])
      equal(matrix(editor.blocks.getBlockById('t').contentElement), [['A', ''], ['B', 'C']])
      assert(editor.blocks.getBlockById('t').contentElement.querySelector('em'), 'rich cell formatting lost')
    } finally { renderer.destroy(root) }
  })

  for (const validationMode of ['preserve', 'strict']) {
    test(`Table repaired overflow cells remain editable and undoable in ${validationMode} mode`, () => {
      const editor = make([{ id: 't', type: 'table', data: { content: [['A'], ['B', 'C']] } }], {
        plugins: [new Paragraph(), new Table()], validationMode,
      })
      const saved = editor.save()
      equal(saved.blocks[0].data.content, [['A', ''], ['B', 'C']])
      const cell = editor.blocks.getBlockById('t').contentElement.querySelector('table').rows[1].cells[1]
      cell.textContent = 'Edited'
      cell.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
      equal(editor.save().blocks[0].data.content, [['A', ''], ['B', 'Edited']])
      editor.undo()
      equal(editor.save().blocks, saved.blocks)
      editor.redo()
      equal(editor.save().blocks[0].data.content, [['A', ''], ['B', 'Edited']])
    })
  }

  test('Table empty input still produces the default editable grid', () => {
    const editor = make([{ id: 't', type: 'table', data: {} }], { plugins: [new Paragraph(), new Table()] })
    equal(editor.save().blocks[0].data.content, [['', '', ''], ['', '', ''], ['', '', '']])
  })
}
