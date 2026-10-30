import { test, make, editorRoot, blockElement, assert, equal } from './harness.js'
import { clickNative, dispatchKey, printable, waitForStyles } from '../native-input-helpers.js'
import { createTablePlugin } from '../../../plugins/table/index.js'
import { createMentionPlugin } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { createDefaultInlineTools } from '../../../preset/index.js'
import { getTextOffset } from '../../../shared/textOffset.js'

test('Table Enter retains the active mark for trusted input on its new line and two separate history actions', async () => {
  const input = { id: 'table', type: 'table', dataVersion: 2, data: {
    withHeadings: false,
    rows: [
      { id: 'first-row', cells: [
        { id: 'active', text: '<b>Alpha</b>' },
        { id: 'rich-neighbor', text: '<i>Bravo</i> {{mention}} {{swatch}} tail' },
      ] },
      { id: 'second-row', cells: [
        { id: 'lower-left', text: '<u>Charlie</u>' },
        { id: 'lower-right', text: 'Delta' },
      ] },
    ],
  }, inline: {
    mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
    swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
  } }
  const supplied = structuredClone(input), transactions = [], nativeEvents = []
  const editor = make([input], { plugins: [createTablePlugin()], defaultBlock: 'table', injectStyles: true,
    inlineTools: [], inlinePlugins: [createMentionPlugin({ searchFunction: async () => [] }), createColorSwatchPlugin()],
  })
  editor.on('transaction:committed', event => transactions.push(event))
  const cell = id => blockElement(editor, 'table').querySelector(`[data-cell-id="${id}"]`)
  const active = cell('active')
  const neighbors = ['rich-neighbor', 'lower-left', 'lower-right'].map(cell)
  const neighborHtml = neighbors.map(element => element.innerHTML)
  const widgets = [...neighbors[0].querySelectorAll('[data-inline-plugin]')]
  equal(widgets.length, 2, 'The neighboring cell must contain real Mention and Color widgets')
  await waitForStyles(document)
  assert(editor.blocks.focus('table', { fieldKey: 'cell:first-row:active', offset: 'end' }))
  for (const type of ['keydown', 'input']) active.addEventListener(type, event => nativeEvents.push({
    type, key: event.key, inputType: event.inputType, trusted: event.isTrusted,
  }))
  const before = editor.save().blocks, retainedBefore = structuredClone(before)
  const expectedBreak = structuredClone(before)
  expectedBreak[0].data.rows[0].cells[0].text = '<b>Alpha<br></b>'
  const expectedInput = structuredClone(expectedBreak)
  expectedInput[0].data.rows[0].cells[0].text = '<b>Alpha<br>X</b>'
  const caret = offset => {
    const selection = getSelection()
    assert(document.activeElement === active && selection.isCollapsed && active.contains(selection.anchorNode),
      'Table Enter/input must retain its authoring field and collapsed caret')
    equal(getTextOffset(active, selection.anchorNode, selection.anchorOffset), offset)
  }
  const unaffected = () => {
    assert(['rich-neighbor', 'lower-left', 'lower-right'].map(cell).every((element, index) => element === neighbors[index]), 'A neighboring cell was replaced')
    equal(neighbors.map(element => element.innerHTML), neighborHtml, 'A neighboring field changed its DOM')
    const currentWidgets = [...neighbors[0].querySelectorAll('[data-inline-plugin]')]
    assert(currentWidgets.length === widgets.length && currentWidgets.every((widget, index) => widget === widgets[index]), 'A neighboring inline widget was replaced')
    equal(editor.save().blocks[0].inline, before[0].inline, 'Line-break editing changed sibling sidecars')
    equal(before, retainedBefore, 'A retained public snapshot changed after editing')
    equal(input, supplied, 'Table editing mutated caller-owned input')
  }

  await dispatchKey('Enter', 'Enter', 13)
  const afterBreak = editor.save().blocks
  caret(6)
  await printable('X')
  // Exercise the continuation before checking the mark: a normalized break
  // alone can look correct while its restored caret has left the formatting.
  equal(active.querySelector('b')?.textContent, 'AlphaX', 'Enter lost the active bold mark for subsequent trusted input')
  equal(afterBreak, expectedBreak)
  equal(editor.save().blocks, expectedInput)
  caret(7)
  const firstLine = document.createRange(), continuation = document.createRange()
  firstLine.selectNodeContents(active.querySelector('b').firstChild)
  continuation.selectNodeContents(getSelection().anchorNode)
  assert(continuation.getBoundingClientRect().top > firstLine.getBoundingClientRect().top,
    'Text after a terminal line break returned to the previous visual line')
  assert(nativeEvents.some(event => event.type === 'keydown' && event.key === 'Enter' && event.trusted))
  assert(nativeEvents.some(event => event.type === 'input' && event.inputType === 'insertText' && event.trusted))
  equal(transactions.length, 2, 'Enter and follow-up input must form two distinct actions')
  unaffected()

  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, expectedBreak); caret(6); unaffected()
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before); caret(5); unaffected()
  assert(!editor.canUndo && editor.canRedo)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, expectedBreak); caret(6); unaffected()
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, expectedInput); caret(7); unaffected()
  assert(editor.canUndo && !editor.canRedo)
  equal(transactions.length, 6)
})

for (const [label, action] of [
  ['Toggle header', 'header'], ['Add row', 'row-add'], ['Delete row', 'row-del'],
  ['Add column', 'col-add'], ['Delete column', 'col-del'],
]) for (const position of ['first', 'last']) {
  test(`Table ${label} after native ${position} cell input preserves rich cells, sidecars and separate history`, async () => {
    const input = { id: 'table', type: 'table', dataVersion: 2, data: {
      withHeadings: false, rows: [
        { id: 'top', cells: [
          { id: 'a', text: '<b>Alpha</b> {{mention}} {{swatch}} tail' },
          { id: 'b', text: '<i>Bravo</i> tail' },
        ] },
        { id: 'bottom', cells: [
          { id: 'c', text: '<u>Charlie</u> tail' }, { id: 'd', text: 'Delta tail' },
        ] },
      ],
    }, inline: {
      mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
      swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
    } }
    const supplied = structuredClone(input), transactions = []
    const editor = make([input], { plugins: [createTablePlugin()], defaultBlock: 'table', injectStyles: true,
      inlineTools: [], inlinePlugins: [createMentionPlugin({ searchFunction: async () => [] }), createColorSwatchPlugin()],
    })
    editor.on('transaction:committed', event => transactions.push(event))
    const cell = id => blockElement(editor, 'table').querySelector(`[data-cell-id="${id}"]`)
    const hosts = new Map(['a', 'b', 'c', 'd'].map(id => [id, cell(id)]))
    const widgets = [...cell('a').querySelectorAll('[data-inline-plugin]')]
    equal(widgets.length, 2, 'Table control fixture must mount real Mention and Color widgets')
    const rowIndex = position === 'first' ? 0 : 1, columnIndex = position === 'first' ? 0 : 1
    const rowId = rowIndex === 0 ? 'top' : 'bottom', activeId = position === 'first' ? 'a' : 'd'
    const before = editor.save().blocks, retainedBefore = structuredClone(before)
    await waitForStyles(document)
    assert(editor.blocks.focus('table', { fieldKey: `cell:${rowId}:${activeId}`, offset: 'end' }))
    await printable('X')
    const typed = structuredClone(before)
    typed[0].data.rows[rowIndex].cells[columnIndex].text += 'X'
    equal(editor.save().blocks, typed)

    await clickNative(editorRoot(editor).querySelector('.oe-toolbar__drag'))
    const menu = editorRoot(editor).querySelector('.oe-settings-menu')
    const button = [...menu.querySelectorAll('[role^="menuitem"]')].find(item => item.querySelector('.oe-settings-menu__label')?.textContent === label)
    assert(button, 'Missing Table setting: ' + label)
    await clickNative(button)
    const after = editor.save().blocks, expected = structuredClone(typed)
    if (action === 'header') expected[0].data.withHeadings = true
    if (action === 'row-add') {
      equal(after[0].data.rows.length, 3)
      const appended = after[0].data.rows[2]
      assert(appended.id && !before[0].data.rows.some(row => row.id === appended.id), 'New row reused a surviving row ID')
      equal(appended.cells.length, 2)
      expected[0].data.rows.push({ id: appended.id, cells: appended.cells.map(cell => ({ id: cell.id, text: '' })) })
    }
    if (action === 'row-del') expected[0].data.rows.pop()
    if (action === 'col-add') {
      equal(after[0].data.rows.map(row => row.cells.length), [3, 3])
      for (let index = 0; index < 2; index++) expected[0].data.rows[index].cells.push({ id: after[0].data.rows[index].cells[2].id, text: '' })
    }
    if (action === 'col-del') for (const row of expected[0].data.rows) row.cells.pop()
    if (action === 'row-add' || action === 'col-add') {
      const ids = after[0].data.rows.flatMap(row => row.cells.map(cell => cell.id))
      assert(ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length,
        'Added cells must have independent nonempty IDs')
    }
    equal(after, expected, 'Table control changed data beyond its own action')
    equal(transactions.length, 2, 'Native input and setting must be separate actions')
    const retained = action === 'header' ? ['c', 'd'] : action === 'row-del' ? ['a', 'b'] : action === 'col-del' ? ['a', 'c'] : ['a', 'b', 'c', 'd']
    const unaffected = () => {
      for (const id of retained) assert(cell(id) === hosts.get(id), 'Table control replaced a surviving unaffected cell')
      equal(editor.save().blocks[0].inline, before[0].inline, 'Table control lost surviving widget sidecars')
      assert(cell('a').textContent.includes('@Ada') && cell('a').textContent.includes('#123456'), 'Table control lost visible widget labels')
      equal(before, retainedBefore, 'Table control mutated a retained public snapshot')
      equal(input, supplied, 'Table control mutated caller-owned input')
    }
    unaffected()
    if (action !== 'header') assert([...cell('a').querySelectorAll('[data-inline-plugin]')].every((widget, index) => widget === widgets[index]),
      'Row/column control replaced surviving widgets')
    equal([...blockElement(editor, 'table').querySelectorAll('.oe-table__cell')].map(element => element.tagName),
      expected[0].data.rows.flatMap((row, index) => row.cells.map(() => expected[0].data.withHeadings && index === 0 ? 'TH' : 'TD')))
    assert(editorRoot(editor).contains(document.activeElement), 'Table setting stranded native history outside the editor')
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, typed); unaffected()
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before); unaffected()
    assert(!editor.canUndo && editor.canRedo)
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, typed); unaffected()
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, after); unaffected()
    assert(editor.canUndo && !editor.canRedo)
    equal(transactions.length, 6)
  })
}

for (const shift of [false, true]) {
  test(`Table real formatting and ${shift ? 'Shift+Enter' : 'Enter'} replace a backward range before row-major navigation and separate history`, async () => {
    const input = { id: 'table', type: 'table', dataVersion: 2, data: {
      withHeadings: false, rows: [
        { id: 'top', cells: [
          { id: 'first', text: 'Alpha {{mention}} tail' },
          { id: 'second', text: 'Bravo {{swatch}}' },
        ] },
        { id: 'bottom', cells: [{ id: 'third', text: 'Charlie' }, { id: 'fourth', text: 'Delta' }] },
      ],
    }, inline: {
      mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
      swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
    } }
    const supplied = structuredClone(input), transactions = []
    const editor = make([input], { plugins: [createTablePlugin()], defaultBlock: 'table', injectStyles: true,
      inlineTools: createDefaultInlineTools({ types: ['bold'] }),
      inlinePlugins: [createMentionPlugin({ searchFunction: async () => [] }), createColorSwatchPlugin()],
    })
    editor.on('transaction:committed', event => transactions.push(event))
    const cell = id => blockElement(editor, 'table').querySelector(`[data-cell-id="${id}"]`)
    const active = cell('first'), second = cell('second'), third = cell('third'), fourth = cell('fourth')
    const secondWidget = second.querySelector('[data-inline-plugin]'), before = editor.save().blocks
    const caret = (field, offset) => {
      const selection = getSelection()
      assert(document.activeElement === field && selection.isCollapsed && field.contains(selection.anchorNode))
      equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), offset)
    }
    const preserved = () => {
      assert(cell('first') === active && cell('second') === second && cell('third') === third && cell('fourth') === fourth,
        'Cell identities changed during formatting, keyboard input or navigation')
      assert(second.querySelector('[data-inline-plugin]') === secondWidget, 'Keyboard editing replaced the neighboring widget')
      equal(editor.save().blocks[0].inline, before[0].inline)
      equal(input, supplied)
    }
    await waitForStyles(document)
    assert(editor.blocks.focus('table', { fieldKey: 'cell:top:first', offset: 'start' }))
    getSelection().setBaseAndExtent(active.firstChild, 5, active.firstChild, 0)
    await dispatchKey('b', 'KeyB', 66, 2)
    const formatted = structuredClone(before)
    formatted[0].data.rows[0].cells[0].text = '<b>Alpha</b> {{mention}} tail'
    equal(editor.save().blocks, formatted, 'Trusted Ctrl+B did not format the selected author text')
    equal(transactions.length, 1)
    const markedText = active.querySelector('b').firstChild
    getSelection().setBaseAndExtent(markedText, 4, markedText, 2)
    await dispatchKey('Enter', 'Enter', 13, shift ? 8 : 0)
    const broken = structuredClone(formatted)
    broken[0].data.rows[0].cells[0].text = '<b>Al<br>a</b> {{mention}} tail'
    equal(editor.save().blocks, broken); caret(active, 3)
    await printable('X')
    const after = structuredClone(broken)
    after[0].data.rows[0].cells[0].text = '<b>Al<br>Xa</b> {{mention}} tail'
    equal(editor.save().blocks, after); caret(active, 4); preserved()
    equal(active.querySelector('b').textContent, 'AlXa')
    equal(transactions.length, 3)
    await dispatchKey('Tab', 'Tab', 9); caret(second, 0)
    await dispatchKey('Tab', 'Tab', 9); caret(third, 0)
    await dispatchKey('Tab', 'Tab', 9, 8); caret(second, 7)
    await dispatchKey('Tab', 'Tab', 9, 8); caret(active, 12)
    equal(editor.save().blocks, after); equal(transactions.length, 3); preserved()

    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, broken); caret(active, 3); preserved()
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, formatted); preserved()
    const selection = getSelection()
    equal([getTextOffset(active, selection.anchorNode, selection.anchorOffset), getTextOffset(active, selection.focusNode, selection.focusOffset)], [4, 2],
      'Undo of the break lost its original backward range')
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before); preserved(); assert(!editor.canUndo)
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, formatted); preserved()
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, broken); caret(active, 3); preserved()
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, after); caret(active, 4); preserved(); assert(!editor.canRedo)
    equal(transactions.length, 9)
  })
}
