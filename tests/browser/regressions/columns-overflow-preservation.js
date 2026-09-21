import { Columns } from '../../../plugins/columns/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { EditorRenderer } from '../../../renderer/index.js'
import { iconPlugin, iconData } from './recheck-54-atomic-emptiness.js'
import { test, make, equal, assert } from './harness.js'

export function register() {
  for (const layout of ['1-1', '1-1-1', 'invalid']) {
    test(`Columns import with ${layout} retains overflow text and atomic data`, () => {
      const columns = ['A', '<b>B</b>', 'C', '{{w}}'].map(content => ({ content }))
      const input = { id: 'a', type: 'columns', data: { layout, columns }, inline: iconData }
      const original = JSON.stringify(input)
      const editor = make([input], { plugins: [new Paragraph(), new Columns()], inlinePlugins: [iconPlugin] })
      const saved = editor.save().blocks
      const expected = layout === '1-1-1' ? ['A', '<b>B</b>', 'C<br>{{w}}'] : ['A', '<b>B</b><br>C<br>{{w}}']
      equal(saved[0].data.columns.map(col => col.content), expected)
      equal(saved[0].inline, iconData)
      equal(JSON.stringify(input), original)
      editor.render(editor.save())
      equal(editor.save().blocks, saved)
      editor.setReadOnly(true); equal(editor.save().blocks, saved)
      editor.setReadOnly(false); equal(editor.save().blocks, saved)
      const widget = editor.blocks.getBlockById('a').contentElement.querySelector('[data-inline-plugin]')
      widget.click(); equal(widget.dataset.clicked, 'yes')
    })
    test(`Columns renderer preserve normalization with ${layout} retains the same overflow as the editor`, () => {
      const input = { blocks: [{ id: 'a', type: 'columns', data: {
        layout, columns: ['A', '<b>B</b>', 'C', '{{w}}'].map(content => ({ content })),
      }, inline: iconData }] }
      const before = JSON.stringify(input)
      const renderer = new EditorRenderer({ injectStyles: false, inlinePlugins: [iconPlugin] })
      let output
      try {
        output = renderer.render(input)
        equal(output.textContent, 'ABC')
        equal(output.querySelectorAll('[data-inline-plugin]').length, 1)
        equal(output.querySelector('b').textContent, 'B')
        equal(JSON.stringify(input), before)
      } finally { renderer.destroy() }
    })
  }
  test('Columns layout reduction keeps imported overflow through Undo and Redo', () => {
    const editor = make([{ id: 'a', type: 'columns', data: { layout: '1-1-1', columns: ['A', 'B', 'C', 'D'].map(content => ({ content })) } }], {
      plugins: [new Paragraph(), new Columns()],
    })
    const before = editor.save().blocks
    equal(before[0].data.columns.map(col => col.content), ['A', 'B', 'C<br>D'])
    const root = editor.blocks.getBlockById('a').contentElement
    root.querySelectorAll('button')[0].click()
    const after = editor.save().blocks
    equal(after[0].data.columns.map(col => col.content), ['A', 'B<br>C<br>D'])
    editor.undo(); equal(editor.save().blocks, before)
    editor.redo(); equal(editor.save().blocks, after)
  })
  test('Columns strict renderer rejects a layout/count mismatch instead of normalizing it', () => {
    const renderer = new EditorRenderer({ injectStyles: false, validationMode: 'strict' })
    let caught = false
    try { renderer.render({ blocks: [{ type: 'columns', data: { layout: '1-1', columns: [{ content: 'A' }, { content: 'B' }, { content: 'C' }] } }] }) }
    catch { caught = true }
    finally { renderer.destroy() }
    assert(caught)
  })
}
