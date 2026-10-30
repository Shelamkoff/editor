import { test, make, blockElement, equal, assert } from './harness.js'
import { createTablePlugin } from '../../../plugins/table/index.js'

test('Table immutable descriptors retain core ownership checks without an optional focus hook', () => {
  const table = createTablePlugin()
  // Exercise the supported descriptor-only focus path. Core must inspect the
  // actual owner on every query, even when the plugin reuses a frozen list.
  const definition = { ...table, setup(context) {
    const runtime = table.setup(context)
    return { ...runtime, create(data, context) {
      return { ...runtime.create(data, context), focus: undefined }
    } }
  } }
  const editor = make([{ id: 'table', type: 'table', dataVersion: 2, data: {
    withHeadings: false, rows: [{ id: 'row', cells: [
      { id: 'first', text: 'Alpha' }, { id: 'second', text: 'Bravo' },
    ] }],
  } }], { plugins: [definition] })
  const before = editor.save().blocks
  const foreign = document.createElement('section')
  const sentinel = document.createElement('textarea')
  sentinel.value = 'Outside'
  foreign.append(sentinel)
  document.body.append(foreign)
  const field = blockElement(editor, 'table').querySelector('.oe-table__cell')
  try {
    for (let count = 0; count < 3; count++) {
      assert(editor.blocks.focus('table', { fieldKey: 'cell:row:first', offset: 1 }))
    }
    foreign.append(field)
    sentinel.focus(); sentinel.setSelectionRange(2, 4, 'backward')
    let accepted = false
    try { accepted = editor.blocks.focus('table', { fieldKey: 'cell:row:first', offset: 1 }) }
    catch (error) { assert(/ownership|boundary|mounted|field/i.test(String(error)), String(error)) }
    assert(accepted !== true, 'A formerly returned descriptor authorized a foreign field')
    assert(document.activeElement === sentinel, 'Rejected field focus stole foreign focus')
    equal([sentinel.selectionStart, sentinel.selectionEnd, sentinel.selectionDirection], [2, 4, 'backward'])
    assert(field.parentNode === foreign, 'Field discovery reparented adopted author DOM')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    editor.destroy()
    assert(field.parentNode === foreign, 'Instance disposal removed an adopted field')
  } finally { editor.destroy(); foreign.remove() }
})

for (const transfer of ['cell', 'row', 'table', 'root']) for (const keyed of [false, true]) {
  test(`Table ${keyed ? 'keyed' : 'default'} focus preserves foreign selection after adoption of its ${transfer}`, () => {
    const editor = make([{ id: 'table', type: 'table', dataVersion: 2, data: {
      withHeadings: false, rows: [{ id: 'row', cells: [
        { id: 'first', text: 'Alpha' }, { id: 'second', text: 'Bravo' },
      ] }],
    } }], { plugins: [createTablePlugin()] })
    const before = editor.save().blocks
    const foreign = document.createElement('section')
    const sentinel = document.createElement('textarea')
    sentinel.value = 'Outside'
    foreign.append(sentinel); document.body.append(foreign)
    const field = blockElement(editor, 'table').querySelector('.oe-table__cell')
    const nodes = { cell: field, row: field.parentNode,
      table: field.closest('table'), root: field.closest('.oe-table-wrapper') }
    const adopted = nodes[transfer]
    const target = keyed ? { fieldKey: 'cell:row:first', offset: 1 } : undefined
    try {
      assert(editor.blocks.focus('table', target), 'Valid focus must work before adoption')
      foreign.append(adopted)
      sentinel.focus(); sentinel.setSelectionRange(2, 4, 'backward')
      const current = editor.blocks.currentId
      let accepted = false
      try { accepted = editor.blocks.focus('table', target) }
      catch (error) { assert(/ownership|boundary|mounted|field/i.test(String(error)), String(error)) }
      assert(accepted !== true, 'A retained Table host authorized foreign focus')
      assert(document.activeElement === sentinel, 'Rejected Table focus stole foreign focus')
      equal([sentinel.selectionStart, sentinel.selectionEnd, sentinel.selectionDirection], [2, 4, 'backward'])
      equal(editor.blocks.currentId, current, 'Rejected focus published another current block')
      assert(adopted.parentNode === foreign, 'Focus recaptured an adopted node')
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      editor.destroy()
      assert(adopted.parentNode === foreign, 'Disposal removed an adopted node')
    } finally { editor.destroy(); foreign.remove() }
  })
}
