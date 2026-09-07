import { Paragraph, Table } from '../../../plugins/index.js'
import { test, make, para, select, paste, assert, equal } from './harness.js'

export function register() {
  const fixtures = [
    ['colspan', '<tr><td colspan="2">Top</td></tr><tr><td>Bottom A</td><td>Bottom B</td></tr>', [['Top', ''], ['Bottom A', 'Bottom B']], false],
    ['header colspan', '<thead><tr><th colspan="2">Top</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody>', [['Top', ''], ['A', 'B']], true],
    ['rowspan', '<tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr>', [['A', 'B'], ['', 'C']], false],
    ['combined spans', '<tr><td rowspan="2" colspan="2">A</td><td>B</td></tr><tr><td>C</td></tr>', [['A', '', 'B'], ['', '', 'C']], false],
    ['zero rowspan respects groups', '<tbody><tr><td rowspan="0">A</td><td>B</td></tr><tr><td>C</td></tr></tbody><tbody><tr><td>D</td><td>E</td></tr></tbody>', [['A', 'B'], ['', 'C'], ['D', 'E']], false],
    ['short rows padded without truncation', '<tr><td>A</td></tr><tr><td>B</td><td>C</td><td>D</td></tr>', [['A', '', ''], ['B', 'C', 'D']], false],
    ['ordinary rectangular cells', '<tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr>', [['A', 'B'], ['C', 'D']], false],
    ['rich content', '<tr><td colspan="2"><b>Top</b></td></tr><tr><td><em>A</em></td><td>B<br>C</td></tr>', [['<b>Top</b>', ''], ['<em>A</em>', 'B<br>C']], false],
    ['nested table is not duplicated into outer rows', '<tr><td>Outer<table><tr><td>Inner</td></tr></table></td><td>Next</td></tr>', [['OuterInner', 'Next']], false],
  ]
  for (const [label, rows, content, withHeadings] of fixtures) {
    test(`HTML table import preserves every cell: ${label}`, async () => {
      const editor = make([para('a', 'Before')], { plugins: [new Paragraph(), new Table()] })
      const p = editor.blocks.getBlockById('a').contentElement
      select(p, 6)
      await paste(p, { 'text/html': `<table>${rows}</table>` })
      const blocks = editor.save().blocks
      equal(blocks.length, 2)
      equal(blocks[1].type, 'table')
      equal(blocks[1].data, { content, withHeadings })
      assert(new Table().validate(blocks[1].data), 'the imported grid must be valid')
      editor.undo(); equal(editor.save().blocks.map(b => b.data.text), ['Before'])
      equal(editor.canUndo, false)
      editor.redo(); equal(editor.save().blocks[1].data, { content, withHeadings })
    })
  }
  test('table span expansion is bounded before changing a selected document', async () => {
    const editor = make([para('a', 'Keep')], { plugins: [new Paragraph(), new Table()] })
    const p = editor.blocks.getBlockById('a').contentElement
    select(p, 0, 4); editor.blocks.selectBlocks(['a'])
    const rows = Array.from({ length: 101 }, () => '<tr><td colspan="1000">Keep too</td></tr>').join('')
    await paste(p, { 'text/html': `<table>${rows}</table>` })
    equal(editor.save().blocks.map(b => b.data.text), ['Keep'])
    equal(editor.canUndo, false)
  })
}
