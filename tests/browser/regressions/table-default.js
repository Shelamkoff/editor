import { test, make, editorHolder, blockElement, assert, equal } from './harness.js'
import { clickNative, dispatchKey, printable } from '../native-input-helpers.js'
import { createTablePlugin } from '../../../plugins/table/index.js'
import { EditorRenderer } from '../../../renderer/index.js'
import { getTextOffset } from '../../../shared/textOffset.js'

const gridShape = root => [...root.querySelectorAll('table tr')].map(row => row.querySelectorAll('td,th').length)
const textGrid = data => data.rows.map(row => row.cells.map(cell => cell.text))
const explicitSingle = {
  withHeadings: true,
  rows: [{ id: 'single-row', cells: [{ id: 'single-cell', text: 'Only cell' }] }],
}
const explicitThree = {
  withHeadings: true,
  rows: [
    { id: 'first', cells: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] },
    { id: 'middle', cells: [{ id: 'a', text: 'D' }, { id: 'b', text: 'E' }, { id: 'c', text: 'F' }] },
    { id: 'last', cells: [{ id: 'a', text: 'G' }, { id: 'b', text: 'H' }, { id: 'c', text: 'I' }] },
  ],
}

for (const [name, suppliedData, expectedShape] of [
  ['no-data construction restores the v1 three-by-three default', undefined, [3, 3, 3]],
  ['explicit one-by-one construction remains one-by-one', explicitSingle, [1]],
  ['explicit three-by-three construction preserves caller cells', explicitThree, [3, 3, 3]],
]) {
  test(`Table default parity: ${name}, renderers, modes and one native Undo/Redo`, async () => {
    const input = suppliedData === undefined ? undefined : {
      version: '2.0.0',
      blocks: [{ id: 'explicit-table', type: 'table', dataVersion: 2, data: structuredClone(suppliedData) }],
    }
    const inputBefore = input === undefined ? undefined : structuredClone(input)
    const editor = make(undefined, {
      data: input, plugins: [createTablePlugin()], defaultBlock: 'table',
      inlinePlugins: [], inlineTools: [], injectStyles: true,
    })
    const renderer = new EditorRenderer({ blockTypes: ['table'], injectStyles: false })
    const output = document.createElement('section')
    document.body.append(output)
    // save() adds a fresh observation timestamp; compare the canonical envelope.
    const savedDocument = () => {
      const { version, blocks } = editor.save()
      return { version, blocks }
    }
    try {
      const before = savedDocument()
      equal(before.version, '2.0.0')
      equal(before.blocks.length, 1)
      const block = before.blocks[0]
      equal([block.type, block.dataVersion], ['table', 2])
      const detached = renderer.render(before)
      renderer.renderTo(before, output)
      equal({
        canonical: block.data.rows.map(row => row.cells.length),
        editor: gridShape(editorHolder(editor)),
        detached: gridShape(detached),
        mounted: gridShape(output),
      }, { canonical: [...expectedShape], editor: [...expectedShape], detached: [...expectedShape], mounted: [...expectedShape] },
      'No-data defaults and explicit dimensions must agree across public save/editor/renderer')
      equal(textGrid(block.data), suppliedData ? textGrid(suppliedData) : [['', '', ''], ['', '', ''], ['', '', '']])
      equal(block.data.withHeadings, suppliedData?.withHeadings ?? false)
      if (suppliedData) equal(block.data, suppliedData, 'Ingestion changed explicit caller cells or identities')
      equal(input, inputBefore, 'Construction mutated the caller document')
      equal([editor.canUndo, editor.canRedo], [false, false])

      const cells = [...blockElement(editor, block.id).querySelectorAll('.oe-table__cell')]
      equal(cells.map(cell => [cell.dataset.rowId, cell.dataset.cellId]),
        block.data.rows.flatMap(row => row.cells.map(cell => [row.id, cell.id])))
      equal(cells.map(cell => cell.tagName), expectedShape.flatMap((count, row) => Array(count).fill(row === 0 && block.data.withHeadings ? 'TH' : 'TD')))
      for (const readOnly of [true, false]) {
        editor.setReadOnly(readOnly)
        equal(editor.readOnly, readOnly)
        equal(savedDocument(), before, 'Mode transition changed author data')
        equal([editor.canUndo, editor.canRedo], [false, false])
        assert(cells.every(cell => cell.isConnected && cell.isContentEditable === !readOnly), 'Mode transition lost a declared cell or its mode')
        assert([...blockElement(editor, block.id).querySelectorAll('.oe-table__cell')].every((cell, index) => cell === cells[index]), 'Mode transition replaced a cell')
      }

      const first = cells[0]
      let trustedInput = false
      first.addEventListener('input', event => { trustedInput ||= event.isTrusted }, { once: true })
      await clickNative(first)
      await dispatchKey('End', 'End', 35)
      await printable('X')
      assert(trustedInput, 'The first cell edit must be a real native input event')
      const after = structuredClone(before)
      after.blocks[0].data.rows[0].cells[0].text += 'X'
      equal(savedDocument(), after, 'Native input changed another cell or lost table data')
      const assertCaret = offset => {
        const selection = window.getSelection()
        assert(document.activeElement === first && selection.isCollapsed && first.contains(selection.anchorNode), 'History lost the first cell caret owner')
        equal(getTextOffset(first, selection.anchorNode, selection.anchorOffset), offset)
      }
      assertCaret(after.blocks[0].data.rows[0].cells[0].text.length)
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(savedDocument(), before)
      equal([editor.canUndo, editor.canRedo], [false, true], 'The first edit must have exactly one Undo action')
      assertCaret(before.blocks[0].data.rows[0].cells[0].text.length)
      await dispatchKey('z', 'KeyZ', 90, 2 | 8)
      equal(savedDocument(), after)
      equal([editor.canUndo, editor.canRedo], [true, false], 'The first edit must have exactly one Redo action')
      assertCaret(after.blocks[0].data.rows[0].cells[0].text.length)
      assert([...blockElement(editor, block.id).querySelectorAll('.oe-table__cell')].every((cell, index) => cell === cells[index]), 'Native replay replaced a cell')
      equal(input, inputBefore, 'Authoring or replay mutated caller data')
    } finally {
      try { renderer.destroy() } finally {
        output.remove()
        editor.destroy()
        assert(!editorHolder(editor).querySelector('.oe-editor'), 'Disposal left the constructed editor root mounted')
      }
    }
  })
}
