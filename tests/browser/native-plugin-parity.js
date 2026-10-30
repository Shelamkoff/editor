import './quote-paste-merge.js'
import './presentation-values.js'
import './regressions/table-default.js'
import './regressions/checklist-empty-exit-native.js'
import './regressions/person-rich-siblings-native.js'
import './regressions/person-cards-native.js'
import './regressions/gallery-native-drag-history.js'
import './gallery-caption-order-native.js'
import { test, make, para, editorRoot, blockElement, editableField, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'
import { createParagraphPlugin, createPollPlugin, createPersonPlugin, createCodePlugin, createTablePlugin, createListPlugin, createChecklistPlugin, createColumnsPlugin, createTogglePlugin, createHeadingPlugin } from '../../plugins/index.js'
import { getTextOffset } from '../../shared/textOffset.js'
import { pluginParityFixtures, readPath, writePath, pixel } from './plugin-parity-fixtures.js'

function poll(options = [{ id: 'first', text: 'Alpha' }, { id: 'second', text: 'Bravo' }]) {
  const definition = createPollPlugin()
  return make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: {
    ...definition.schema.createDefault(), question: 'Question', options,
  } }], { plugins: [createParagraphPlugin(), definition] })
}

function caret(field, offset) {
  assert(document.activeElement === field, 'Plugin action lost its editing host focus')
  const selection = window.getSelection()
  assert(selection.isCollapsed && field.contains(selection.anchorNode), 'Plugin action lost its collapsed caret')
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), offset, 'Plugin caret is at the wrong boundary')
}

test('Poll Enter in the question focuses the first option without changing the document', async () => {
  const editor = poll()
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('.oe-poll__question'))
  await dispatchKey('Enter', 'Enter', 13)
  equal(editor.save().blocks, before, 'Question Enter changed the Poll or inserted another block')
  caret(blockElement(editor, 'a').querySelector('.oe-poll__option-text[data-option-id="first"]'), 0)
  equal(editor.canUndo, false)
})

test('Poll successive native input keeps the caret after the inserted text', async () => {
  const editor = poll()
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('.oe-poll__question'))
  await dispatchKey('End', 'End', 35)
  await printable('X')
  await printable('Y')
  equal(editor.save().blocks[0].data.question, 'QuestionXY', 'Poll input reordered characters')
  caret(blockElement(editor, 'a').querySelector('.oe-poll__question'), 10)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks[0].data.question, 'QuestionXY')
  caret(blockElement(editor, 'a').querySelector('.oe-poll__question'), 10)
})

test('Poll Enter in an option inserts a following empty option as one action', async () => {
  const editor = poll()
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('[data-option-id="first"].oe-poll__option-text'))
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after.length, 1)
  equal(after[0].data.options.map(option => option.text), ['Alpha', '', 'Bravo'])
  assert(after[0].data.options[1].id !== 'first' && after[0].data.options[1].id !== 'second', 'New Poll option reused an ID')
  const next = () => blockElement(editor, 'a').querySelector(`[data-option-id="${after[0].data.options[1].id}"].oe-poll__option-text`)
  caret(next(), 0)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(next(), 0)
})


test('Poll Backspace removes visually empty markup and restores it with Undo', async () => {
  const editor = poll([
    { id: 'first', text: 'Alpha' },
    { id: 'empty', text: '<strong></strong>' },
    { id: 'last', text: 'Bravo' },
  ])
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'option:empty', offset: 'start' })
  await dispatchKey('Backspace', 'Backspace', 8)
  const after = editor.save().blocks
  equal(after[0].data.options.map(item => item.id), ['first', 'last'],
    'Poll regarded empty rich-text markup as a real option value')
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
  equal(editor.redo(), true)
  equal(editor.save().blocks, after)
})

test('Poll Backspace removes an empty option and focuses the previous text at its end', async () => {
  const editor = poll([{ id: 'first', text: 'Alpha' }, { id: 'empty', text: '' }, { id: 'last', text: 'Bravo' }])
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'option:empty', offset: 'start' })
  await dispatchKey('Backspace', 'Backspace', 8)
  const after = editor.save().blocks
  equal(after[0].data.options, [{ id: 'first', text: 'Alpha' }, { id: 'last', text: 'Bravo' }])
  caret(blockElement(editor, 'a').querySelector('.oe-poll__option-text[data-option-id="first"]'), 5)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(blockElement(editor, 'a').querySelector('.oe-poll__option-text[data-option-id="first"]'), 5)
})

test('Person name remains a single line when Enter is pressed', async () => {
  const definition = createPersonPlugin()
  const editor = make([{ id: 'a', type: 'person', dataVersion: 2, data: { persons: [{ id: 'first', avatar: '', name: 'Alpha', role: 'Editor', bio: 'Bravo', links: [] }] } }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('.oe-person__name'))
  await dispatchKey('End', 'End', 35)
  await dispatchKey('Enter', 'Enter', 13)
  equal(editor.save().blocks, before)
  equal(blockElement(editor, 'a').querySelector('.oe-person__name').innerHTML, 'Alpha', 'Enter inserted a visual line break in the name')
  caret(blockElement(editor, 'a').querySelector('.oe-person__name'), 5)
  equal(editor.canUndo, false)
})

test('Code Escape leaves editing mode without changing code or history', async () => {
  const definition = createCodePlugin()
  const editor = make([{ id: 'a', type: 'code', dataVersion: definition.schema.currentVersion, data: { code: 'Alpha', language: 'javascript' } }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('.oe-code-pre'))
  assert(blockElement(editor, 'a').querySelector('.oe-code-wrap').classList.contains('oe-code-wrap--editing'))
  await dispatchKey('Escape', 'Escape', 27)
  assert(!blockElement(editor, 'a').querySelector('.oe-code-wrap').classList.contains('oe-code-wrap--editing'), 'Escape did not leave Code edit mode')
  assert(blockElement(editor, 'a').contains(document.activeElement), 'Escape lost Code block focus')
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

test('Code Ctrl+Enter leaves edit mode and keyboard Undo remains available from its view', async () => {
  const definition = createCodePlugin()
  const editor = make([{ id: 'a', type: 'code', dataVersion: definition.schema.currentVersion, data: { code: 'Alpha', language: 'javascript' } }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('.oe-code-pre'))
  await dispatchKey('End', 'End', 35)
  await printable('X')
  const after = editor.save().blocks
  equal(after[0].data.code, 'AlphaX')
  await dispatchKey('Enter', 'Enter', 13, 2)
  assert(!blockElement(editor, 'a').querySelector('.oe-code-wrap').classList.contains('oe-code-wrap--editing'), 'Ctrl+Enter did not leave Code edit mode')
  equal(editor.save().blocks, after, 'Ctrl+Enter inserted a newline')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before, 'Undo from Code view was swallowed')
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  assert(editorRoot(editor).contains(document.activeElement), 'Code history lost editor focus')
})

test('Code highlighted layer stays visible and follows native input in edit mode', async () => {
  const definition = createCodePlugin()
  const editor = make([{ id: 'a', type: 'code', dataVersion: definition.schema.currentVersion, data: { code: 'Alpha', language: 'plaintext' } }], { plugins: [createParagraphPlugin(), definition] })
  await clickNative(blockElement(editor, 'a').querySelector('.oe-code-pre'))
  const pre = blockElement(editor, 'a').querySelector('.oe-code-pre')
  assert(getComputedStyle(pre).display !== 'none', 'Transparent input lost its visible highlighted layer')
  await dispatchKey('End', 'End', 35)
  await printable('X')
  equal(pre.textContent.trimEnd(), 'AlphaX', 'Visible Code layer did not follow the input')
  equal(editor.save().blocks[0].data.code, 'AlphaX')
})

test('Code Copy uses the latest committed native input and pastes into another block', async () => {
  const definition = createCodePlugin()
  const editor = make([{ id: 'a', type: 'code', dataVersion: definition.schema.currentVersion, data: { code: 'Alpha', language: 'plaintext' } }, para('b', '')], { plugins: [createParagraphPlugin(), definition] })
  await clickNative(blockElement(editor, 'a').querySelector('.oe-code-pre'))
  await dispatchKey('End', 'End', 35)
  await printable('X')
  await clickNative(blockElement(editor, 'a').querySelector('.oe-code-btn--copy'))
  await pause(60)
  await clickNative(editableField(editor, 'b'))
  await dispatchKey('v', 'KeyV', 86, 2)
  await pause(40)
  equal(editor.save().blocks.map(block => block.data.code ?? block.data.text), ['AlphaX', 'AlphaX'], 'Copy exported stale Code data')
})

test('Code Tab inserts four spaces and Shift+Tab removes one indentation unit', async () => {
  const definition = createCodePlugin()
  const editor = make([{ id: 'a', type: 'code', dataVersion: definition.schema.currentVersion, data: { code: 'Alpha', language: 'plaintext' } }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'code', offset: 'start' })
  await dispatchKey('Tab', 'Tab', 9)
  equal(editor.save().blocks[0].data.code, '    Alpha', 'Code indentation differs from v1')
  const textarea = blockElement(editor, 'a').querySelector('textarea')
  equal([textarea.selectionStart, textarea.selectionEnd], [4, 4])
  equal(blockElement(editor, 'a').querySelector('pre').textContent.trimEnd(), '    Alpha')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks[0].data.code, '    Alpha')
  await dispatchKey('Tab', 'Tab', 9, 8)
  equal(editor.save().blocks, before)
  equal([textarea.selectionStart, textarea.selectionEnd], [0, 0])
})

test('Code language menu filters by typed text and commits a keyboard-selected language', async () => {
  const definition = createCodePlugin()
  const editor = make([{ id: 'a', type: 'code', dataVersion: definition.schema.currentVersion, data: { code: 'Alpha', language: 'plaintext' } }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('.oe-code-pre'))
  const trigger = blockElement(editor, 'a').querySelector('.oe-code-dropdown__trigger')
  assert(trigger, 'Searchable Code language menu is missing')
  await clickNative(trigger)
  const search = blockElement(editor, 'a').querySelector('.oe-code-dropdown__search')
  assert(document.activeElement === search, 'Language search did not receive focus')
  await printable('p')
  await printable('y')
  const visible = [...blockElement(editor, 'a').querySelectorAll('[role="option"]')].filter(item => getComputedStyle(item).display !== 'none')
  equal(visible.map(item => item.dataset.value), ['python'])
  await dispatchKey('ArrowDown', 'ArrowDown', 40)
  await dispatchKey('Enter', 'Enter', 13)
  equal(editor.save().blocks[0].data, { code: 'Alpha', language: 'python' })
  equal(trigger.getAttribute('aria-expanded'), 'false')
  assert(document.activeElement === trigger, 'Language commit lost trigger focus')
  // The language button is a plugin-owned native control. Canonical history
  // starts only after the author explicitly returns to an editor-owned field.
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data, { code: 'Alpha', language: 'python' },
    'An auxiliary language button intercepted canonical Undo')
  await clickNative(blockElement(editor, 'a').querySelector('.oe-code-textarea'))
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks[0].data.language, 'python')
})

test('Code Tab indents a multiline selection without replacing its source text', async () => {
  const definition = createCodePlugin()
  const editor = make([{ id: 'a', type: 'code', dataVersion: definition.schema.currentVersion, data: { code: 'Alpha\nBravo', language: 'plaintext' } }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'code', offset: 'start' })
  await dispatchKey('a', 'KeyA', 65, 2)
  await dispatchKey('Tab', 'Tab', 9)
  const after = editor.save().blocks
  equal(after[0].data.code, '    Alpha\n    Bravo', 'Tab replaced selected code instead of indenting both lines')
  const textarea = blockElement(editor, 'a').querySelector('textarea')
  equal([textarea.selectionStart, textarea.selectionEnd], [0, 19])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  await dispatchKey('Tab', 'Tab', 9, 8)
  equal(editor.save().blocks, before)
  equal([textarea.selectionStart, textarea.selectionEnd], [0, 11])
})

test('Table keeps cells with delimiter-containing row and cell identities independent through native editing and history', async () => {
  const definition = createTablePlugin()
  const editor = make([{ id: 'a', type: 'table', dataVersion: 2, data: { withHeadings: false, rows: [
    { id: 'row:branch', cells: [{ id: 'leaf', text: 'Alpha' }] },
    { id: 'row', cells: [{ id: 'branch:leaf', text: 'Bravo' }] },
    { id: 'row%3Abranch', cells: [{ id: 'leaf', text: 'Charlie' }] },
  ] } }], { plugins: [createParagraphPlugin(), definition], injectStyles: true })
  const before = editor.save().blocks
  const cell = index => blockElement(editor, 'a').querySelectorAll('.oe-table__cell')[index]
  equal([...blockElement(editor, 'a').querySelectorAll('.oe-table__cell')].map(element => element.textContent), ['Alpha', 'Bravo', 'Charlie'])
  await clickNative(cell(0)); await dispatchKey('End', 'End', 35)
  await dispatchKey('Tab', 'Tab', 9); caret(cell(1), 0)
  await dispatchKey('End', 'End', 35); await printable('X')
  await dispatchKey('Enter', 'Enter', 13); await printable('Y')
  equal(editor.save().blocks[0].data.rows.map(row => row.cells[0].text), ['Alpha', 'BravoX<br>Y', 'Charlie'])
  const after = editor.save().blocks
  caret(cell(1), 8)
  for (let i = 0; i < 3; i++) await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  for (let i = 0; i < 3; i++) await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after); caret(cell(1), 8)
  await dispatchKey('Tab', 'Tab', 9); caret(cell(2), 0)
  await dispatchKey('Tab', 'Tab', 9, 8); caret(cell(1), 8)
})

test('Table Shift+Tab focuses the previous cell at its end as in v1', async () => {
  const definition = createTablePlugin()
  const editor = make([{ id: 'a', type: 'table', dataVersion: 2, data: { withHeadings: false, rows: [{ id: 'row', cells: [{ id: 'first', text: 'Alpha' }, { id: 'second', text: 'Bravo' }] }] } }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'cell:row:second', offset: 'start' })
  await dispatchKey('Tab', 'Tab', 9, 8)
  caret(blockElement(editor, 'a').querySelector('[data-cell-id="first"]'), 5)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('Tab', 'Tab', 9)
  caret(blockElement(editor, 'a').querySelector('[data-cell-id="second"]'), 0)
})

test('Table rejected adopted-cell focus preserves the next native input outside the editor', async () => {
  const definition = createTablePlugin()
  const editor = make([{ id: 'a', type: 'table', dataVersion: 2, data: { withHeadings: false,
    rows: [{ id: 'row', cells: [{ id: 'first', text: 'Alpha' }, { id: 'second', text: 'Bravo' }] }],
  } }], { plugins: [definition] })
  const before = editor.save().blocks
  const cell = blockElement(editor, 'a').querySelector('[data-cell-id="first"]')
  const foreign = document.createElement('section')
  const sentinel = document.createElement('textarea')
  sentinel.value = 'Outside'
  foreign.append(sentinel); document.body.append(foreign)
  try {
    assert(editor.blocks.focus('a', { fieldKey: 'cell:row:first', offset: 2 }))
    caret(cell, 2)
    foreign.append(cell)
    await clickNative(sentinel)
    sentinel.setSelectionRange(2, 4, 'backward')
    let accepted = false
    try { accepted = editor.blocks.focus('a', { fieldKey: 'cell:row:first', offset: 1 }) }
    catch (error) { assert(/ownership|boundary|mounted|field/i.test(String(error)), String(error)) }
    assert(accepted !== true, 'Adopted cell focus was accepted')
    assert(document.activeElement === sentinel, 'Rejected Table focus stole the foreign input')
    equal([sentinel.selectionStart, sentinel.selectionEnd, sentinel.selectionDirection], [2, 4, 'backward'])
    await printable('X')
    equal(sentinel.value, 'OuXide', 'Next native input did not reach the retained foreign selection')
    equal(cell.textContent, 'Alpha', 'Next native input mutated the adopted Table cell')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  } finally { editor.destroy(); foreign.remove() }
})

test('Table exact focus preserves valid default and keyed editing through a mode round trip', async () => {
  const definition = createTablePlugin()
  const editor = make([{ id: 'a', type: 'table', dataVersion: 2, data: { withHeadings: false,
    rows: [{ id: 'row', cells: [{ id: 'first', text: 'Alpha' }, { id: 'second', text: 'Bravo' }] }],
  } }], { plugins: [definition] })
  const before = editor.save().blocks
  const cell = id => blockElement(editor, 'a').querySelector(`[data-cell-id="${id}"]`)
  assert(editor.blocks.focus('a'))
  caret(cell('first'), 0)
  assert(editor.blocks.focus('a', { fieldKey: 'cell:row:second', offset: 2.9 }))
  caret(cell('second'), 2)
  equal(editor.blocks.focus('a', { fieldKey: 'retired-cell', offset: 1 }), false)
  caret(cell('second'), 2)
  editor.setReadOnly(true)
  equal(cell('first').contentEditable, 'false')
  equal(cell('second').contentEditable, 'false')
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  editor.setReadOnly(false)
  assert(editor.blocks.focus('a', { fieldKey: 'cell:row:second', offset: 'end' }))
  caret(cell('second'), 5)
  await printable('X')
  equal(editor.save().blocks[0].data.rows[0].cells.map(field => field.text), ['Alpha', 'BravoX'])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

test('Table Enter inserts a line break in the cell and keeps typing at that boundary', async () => {
  const definition = createTablePlugin()
  const editor = make([{ id: 'a', type: 'table', dataVersion: 2, data: { withHeadings: false, rows: [{ id: 'row', cells: [{ id: 'first', text: 'Alpha' }, { id: 'second', text: 'Bravo' }] }] } }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'cell:row:first', offset: 2 })
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after[0].data.rows[0].cells[0].text, 'Al<br>pha', 'Table Enter did not preserve a line break')
  caret(blockElement(editor, 'a').querySelector('[data-cell-id="first"]'), 3)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(blockElement(editor, 'a').querySelector('[data-cell-id="first"]'), 3)
  await printable('X')
  equal(editor.save().blocks[0].data.rows[0].cells[0].text, 'Al<br>Xpha')
})

test('Toggle body Enter keeps a line break, caret and one history action', async () => {
  const definition = createTogglePlugin()
  const editor = make([{ id: 'a', type: 'toggle', dataVersion: definition.schema.currentVersion, data: { title: 'Title', content: 'Alpha', open: true } }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  const observed = []
  for (const name of ['beforeinput', 'input']) editorRoot(editor).addEventListener(name, event => observed.push({ name, inputType: event.inputType, canceled: event.defaultPrevented, target: event.target.className, html: event.target.innerHTML }))
  editor.blocks.focus('a', { fieldKey: 'content', offset: 2 })
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after[0].data.content, 'Al<br>pha', `Toggle lost its native paragraph break: ${JSON.stringify(observed)}`)
  caret(blockElement(editor, 'a').querySelector('.oe-toggle__body'), 3)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  caret(blockElement(editor, 'a').querySelector('.oe-toggle__body'), 3)
  await printable('X')
  equal(editor.save().blocks[0].data.content, 'Al<br>Xpha')
})

function pluginEditor(fixture, options = {}) {
  const definition = fixture.factory()
  return make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: structuredClone(fixture.data) }], {
    plugins: definition.type === 'paragraph' ? [definition] : [createParagraphPlugin(), definition], ...options,
  })
}

function focusedField(editor, spec, offset) {
  editor.blocks.focus('a', { fieldKey: spec.key, offset })
  const field = document.activeElement
  assert(editorRoot(editor).contains(field), `Field ${spec.key} did not receive focus`)
  assert(field.matches('input,textarea,[contenteditable="true"]'), `Field ${spec.key} is not an editing host`)
  return field
}

function checkFieldCaret(field, offset) {
  if (typeof field.selectionStart === 'number') equal([field.selectionStart, field.selectionEnd], [offset, offset])
  else caret(field, offset)
}

test('invalid plugin field focus preserves the current native caret and active block', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Quote')
  const editor = pluginEditor(fixture)
  const field = focusedField(editor, { key: 'text' }, 2)
  const before = editor.save().blocks
  const oldCurrent = editor.blocks.currentId
  const selection = window.getSelection()
  const anchor = selection.anchorNode
  const focus = selection.focusNode
  const anchorOffset = selection.anchorOffset
  const focusOffset = selection.focusOffset

  equal(editor.blocks.focus('a', { fieldKey: 'retired-caption', offset: 1 }), false,
    'a missing field was treated as a successful focus')
  equal(editor.blocks.currentId, oldCurrent)
  equal(document.activeElement, field)
  equal(selection.anchorNode, anchor)
  equal(selection.focusNode, focus)
  equal(selection.anchorOffset, anchorOffset)
  equal(selection.focusOffset, focusOffset)
  equal(editor.save().blocks, before,
    'a rejected native caret restoration caused a canonical author edit')
})

for (const fixture of pluginParityFixtures) {
  for (const spec of fixture.fields) {
    test(`${fixture.name} ${spec.key}: native input, local selection, caret and history`, async () => {
      const editor = pluginEditor(fixture)
      const before = editor.save().blocks
      const original = before[0].data
      equal(readPath(original, spec.path), spec.value)
      focusedField(editor, spec, 'end')
      await printable('X')
      await printable('Y')
      const after = editor.save().blocks
      const expected = fixture.name === 'LinkPreview'
        ? { ...fixture.factory().schema.createDefault(), template: original.template, url: spec.value + 'XY', domain: 'example.com' }
        : writePath(original, spec.path, spec.value + 'XY')
      equal(after[0].data, expected, 'Native input changed unrelated data or reordered text')
      checkFieldCaret(focusedField(editor, spec, 'end'), spec.value.length + 2)
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      await dispatchKey('z', 'KeyZ', 90, 2 | 8)
      equal(editor.save().blocks, after)
      checkFieldCaret(document.activeElement, spec.value.length + 2)
      const start = spec.key.endsWith('url') ? spec.value.length - 5 : 2
      focusedField(editor, spec, start)
      await dispatchKey('ArrowRight', 'ArrowRight', 39, 8)
      await dispatchKey('ArrowRight', 'ArrowRight', 39, 8)
      await printable('Z')
      equal(readPath(editor.save().blocks[0].data, spec.path), spec.value.slice(0, start) + 'Z' + spec.value.slice(start + 2) + 'XY', 'Typing did not replace exactly the native selected range')
      checkFieldCaret(document.activeElement, start + 1)
    })
  }
}

test('Person can add a blank link and type its URL without invalid canonical data', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Person')
  const editor = pluginEditor({ ...fixture, data: { persons: [{ id: 'first', name: 'Alpha', role: '', bio: '', avatar: '', links: [] }] } })
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('.oe-person__link-add'))
  const input = blockElement(editor, 'a').querySelector('input[data-link-id]')
  assert(input, 'Add link did not create its input')
  await clickNative(input)
  for (const text of 'https://example.com') await printable(text)
  equal(input.value, 'https://example.com', 'URL typing lost its draft')
  await dispatchKey('Enter', 'Enter', 13)
  equal(editor.save().blocks[0].data.persons[0].links.map(link => link.url), ['https://example.com'])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.persons[0].links[0].url, '')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
})

test('LinkPreview accepts a URL typed from an empty draft and resolves metadata after input', async () => {
  const calls = []
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const editor = pluginEditor({ ...fixture, data: { url: '', title: '', template: 'horizontal' }, factory: () => fixture.factory({ fetchMeta: async url => { calls.push(url); return { title: 'Resolved' } } }) })
  const input = focusedField(editor, { key: 'url' }, 'start')
  for (const text of 'https://example.com') await printable(text)
  equal(input.value, 'https://example.com', 'Typing a URL lost its unfinished prefix')
  await pause(650)
  equal(calls, ['https://example.com'])
  equal(editor.save().blocks[0].data.title, 'Resolved')
})

test('LinkPreview host URL replacement stays a separate Undo step from explicit metadata refresh', async () => {
  const pending = []
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const editor = pluginEditor({
    ...fixture,
    factory: () => fixture.factory({
      fetchMeta: (url, { signal }) => new Promise(resolve => {
        pending.push({ url, signal, resolve })
      }),
    }),
  })
  const before = editor.save().blocks
  const hostUrl = 'https://host.example/new'
  editor.blocks.update('a', current => ({
    data: { ...current.data, url: hostUrl, title: 'Host title', domain: 'host.example' },
  }))
  const afterHost = editor.save().blocks
  const input = focusedField(editor, { key: 'url' }, 'end')
  equal(input.value, hostUrl)
  input.dispatchEvent(new Event('change', { bubbles: true }))
  equal(pending.length, 1, 'explicit metadata refresh did not start')
  pending[0].resolve({ title: 'Enriched title' })
  await pause(50)
  const afterMetadata = editor.save().blocks
  equal(afterMetadata[0].data.title, 'Enriched title')

  equal(editor.undo(), true)
  equal(editor.save().blocks, afterHost,
    'metadata enrichment improperly absorbed an earlier unrelated host URL update')
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
  equal(editor.redo(), true)
  equal(editor.save().blocks, afterHost)
  equal(editor.redo(), true)
  equal(editor.save().blocks, afterMetadata)
})

test('LinkPreview URL and delayed metadata undo as one action when no edit intervenes', async () => {
  const pending = []
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const editor = pluginEditor({
    ...fixture,
    factory: () => fixture.factory({
      fetchMeta: (url, { signal }) => new Promise(resolve => {
        pending.push({ url, signal, resolve })
      }),
    }),
  })
  const before = editor.save().blocks
  const input = focusedField(editor, { key: 'url' }, 'end')
  input.value = 'https://vimeo.com/123456'
  input.dispatchEvent(new Event('change', { bubbles: true }))
  equal(pending.length, 1)
  const afterUrl = editor.save().blocks
  equal(afterUrl[0].data.url, 'https://vimeo.com/123456')
  equal(afterUrl[0].data.title, '')

  pending[0].resolve({ title: 'Resolved video', description: 'Metadata description' })
  await pause(50)
  const afterMetadata = editor.save().blocks
  equal(afterMetadata[0].data.title, 'Resolved video')
  equal(afterMetadata[0].data.description, 'Metadata description')
  equal(editor.undo(), true)
  equal(editor.save().blocks, before,
    'Undo left the submitted URL behind instead of reverting the whole URL gesture')
  equal(editor.canUndo, false)
  equal(editor.redo(), true)
  equal(editor.save().blocks, afterMetadata,
    'Redo failed to restore URL and its metadata together')
})

test('LinkPreview metadata remains an independent Undo action after intervening host edit', async () => {
  const pending = []
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const editor = pluginEditor({
    ...fixture,
    factory: () => fixture.factory({
      fetchMeta: (url, { signal }) => new Promise(resolve => {
        pending.push({ url, signal, resolve })
      }),
    }),
  })
  const before = editor.save().blocks
  const input = focusedField(editor, { key: 'url' }, 'end')
  input.value = 'https://vimeo.com/123456'
  input.dispatchEvent(new Event('change', { bubbles: true }))
  const afterUrl = editor.save().blocks
  equal(pending.length, 1)

  editor.blocks.update('a', current => ({
    data: { ...current.data, template: 'compact' },
  }))
  const afterHost = editor.save().blocks
  pending[0].resolve({ title: 'Resolved video' })
  await pause(50)
  equal(editor.save().blocks[0].data.title, 'Resolved video')

  equal(editor.undo(), true)
  equal(editor.save().blocks, afterHost,
    'delayed metadata wrongly merged across the host template edit')
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterUrl)
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
})

test('LinkPreview native URL caret survives template and metadata changes', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const editor = pluginEditor(fixture)
  const input = focusedField(editor, { key: 'url' }, 'end')
  await printable('X')
  const afterInput = editor.save().blocks
  const authored = afterInput[0].data.url
  equal(authored, 'https://example.com/AlphaX')
  checkFieldCaret(input, authored.length)

  editor.blocks.update('a', current => ({
    data: { ...current.data, template: 'compact', title: 'Changed by host' },
  }))
  const afterHost = editor.save().blocks
  equal(afterHost[0].data.url, authored)
  equal(input.value, authored,
    'LinkPreview host metadata update replaced an already committed native URL')
  equal(document.activeElement, input,
    'LinkPreview metadata update lost active URL editing focus')
  checkFieldCaret(input, authored.length)
  equal(blockElement(editor, 'a').querySelector('.oe-lp__card')?.classList.contains('oe-lp__card--compact'), true)

  await printable('Y')
  equal(editor.save().blocks[0].data.url, authored + 'Y')
  checkFieldCaret(input, authored.length + 1)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterHost)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput)
})

test('LinkPreview pending URL survives unrelated template update and is eventually applied', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const editor = pluginEditor(fixture)
  const input = focusedField(editor, { key: 'url' }, 'end')
  const draft = 'https://vimeo.com/123456'
  input.value = draft
  input.dispatchEvent(new Event('input', { bubbles: true }))
  editor.blocks.update('a', current => ({
    data: { ...current.data, template: 'compact' },
  }))

  equal(document.activeElement, input)
  equal(input.value, draft, 'LinkPreview metadata projection erased the pending URL')
  await pause(700)
  const after = editor.save().blocks[0].data
  equal(after.url, draft)
  equal(after.domain, 'vimeo.com')
  equal(after.template, 'compact')
})

test('LinkPreview late metadata respects newer host edits and cancels an obsolete URL', async () => {
  const pending = []
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const editor = pluginEditor({
    ...fixture,
    factory: () => fixture.factory({
      fetchMeta: (url, { signal }) => new Promise(resolve => {
        pending.push({ url, signal, resolve })
      }),
    }),
  })
  const input = focusedField(editor, { key: 'url' }, 'end')
  input.value = 'https://vimeo.com/123456'
  input.dispatchEvent(new Event('change', { bubbles: true }))
  equal(pending.length, 1)
  equal(pending[0].url, 'https://vimeo.com/123456')
  equal(pending[0].signal.aborted, false)

  editor.blocks.update('a', current => ({
    data: { ...current.data, title: 'Host-authored title' },
  }))
  pending[0].resolve({ title: 'Late fetched title', description: 'Fetched description' })
  await pause(50)
  const afterMetadata = editor.save().blocks[0].data
  equal(afterMetadata.title, 'Host-authored title',
    'late metadata replaced a newer author-provided title')
  equal(afterMetadata.description, 'Fetched description',
    'metadata response no longer populates an untouched field')

  input.value = 'https://example.org/second'
  input.dispatchEvent(new Event('change', { bubbles: true }))
  equal(pending.length, 2)
  equal(pending[1].signal.aborted, false)

  editor.blocks.update('a', current => ({
    data: { ...current.data, url: 'https://example.net/host', title: 'New host source' },
  }))
  equal(pending[1].signal.aborted, true,
    'old URL metadata task remained alive after host source replacement')
  pending[1].resolve({ title: 'Obsolete fetched title' })
  await pause(50)
  const afterSource = editor.save().blocks[0].data
  equal(afterSource.url, 'https://example.net/host')
  equal(afterSource.title, 'New host source')
})

test('LinkPreview stale fetch cannot overwrite a host description after ABA changes', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const pending = []
  const editor = pluginEditor({
    ...fixture,
    factory: () => fixture.factory({
      fetchMeta: (url, { signal }) => new Promise(resolve => {
        pending.push({ url, signal, resolve })
      }),
    }),
  })
  const input = focusedField(editor, { key: 'url' }, 'end')
  input.value = 'https://vimeo.com/123456'
  input.dispatchEvent(new Event('change', { bubbles: true }))
  equal(pending.length, 1)

  editor.blocks.update('a', current => ({
    data: { ...current.data, description: 'Host author description' },
  }))
  editor.blocks.update('a', current => ({
    data: { ...current.data, description: '' },
  }))
  pending[0].resolve({ title: 'Fetched title', description: 'Stale response description' })
  await pause(50)
  const after = editor.save().blocks[0].data
  equal(after.title, 'Fetched title', 'untouched metadata field was not enriched')
  equal(after.description, '',
    'LinkPreview late metadata overwrote a field changed twice by the host')
})

test('LinkPreview restoration does not refetch old metadata but explicit submission still does', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const requests = []
  const editor = pluginEditor({
    ...fixture,
    data: { ...fixture.data, title: '', image: '', favicon: '' },
    factory: () => fixture.factory({
      fetchMeta: (url, { signal }) => {
        requests.push({ url, signal })
        return new Promise(() => {})
      },
    }),
  })
  await pause(60)
  equal(requests.length, 1, 'initial LinkPreview metadata enrichment did not run')
  const initialUrl = requests[0].url
  editor.blocks.remove('a')
  equal(requests[0].signal.aborted, true,
    'removed LinkPreview retained its in-flight metadata request')
  equal(editor.undo(), true)
  await pause(60)
  equal(requests.length, 1,
    'restoring LinkPreview with Undo restarted automatic metadata enrichment')
  const wrapper = blockElement(editor, 'a')
  const input = wrapper.querySelector('.oe-lp__url-input')
  assert(input, 'restored LinkPreview is not editable')
  input.value = 'https://example.org/new'
  input.dispatchEvent(new Event('change', { bubbles: true }))
  equal(requests.length, 2, 'explicit URL submission no longer resolves metadata after Undo')
  equal(requests[1].url, 'https://example.org/new')
})

test('LinkPreview initial metadata microtask cannot restart a newer submitted URL', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const requests = []
  const editor = pluginEditor({
    ...fixture,
    data: { ...fixture.data, title: '', image: '', favicon: '' },
    factory: () => fixture.factory({
      fetchMeta: (url, { signal }) => {
        requests.push({ url, signal })
        return new Promise(() => {})
      },
    }),
  })
  // The initial-enrichment microtask has not yet run: submit a new URL in
  // the same JavaScript task, then allow queued work to execute.
  const input = blockElement(editor, 'a').querySelector('.oe-lp__url-input')
  input.value = 'https://vimeo.com/123456'
  input.dispatchEvent(new Event('change', { bubbles: true }))
  equal(requests.map(request => request.url), ['https://vimeo.com/123456'])
  await pause(60)
  equal(requests.map(request => request.url), ['https://vimeo.com/123456'],
    'initial LinkPreview enrichment restarted or replaced a newer request')
  equal(requests[0].signal.aborted, false)
})

test('LinkPreview does not submit partial URL from an active IME composition', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'LinkPreview')
  const editor = pluginEditor(fixture)
  const before = editor.save().blocks
  const input = focusedField(editor, { key: 'url' }, 'end')
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
  input.value = 'https://vimeo.com/123456'
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true, inputType: 'insertCompositionText', data: '123456', isComposing: true,
  }))
  input.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true, key: 'Enter', code: 'Enter', isComposing: true,
  }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await pause(650)
  equal(editor.save().blocks, before,
    'a LinkPreview preedit URL was committed before compositionend')

  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '123456' }))
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true, inputType: 'insertText', data: '123456', isComposing: false,
  }))
  await pause(650)
  equal(editor.save().blocks[0].data.url, 'https://vimeo.com/123456',
    'final IME URL was not persisted after composition ended')
})

test('Gallery rich captions keep their marks through native editing and history', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Gallery')
  const editor = pluginEditor({ ...fixture, data: { ...fixture.data, images: [{ id: 'first', url: fixture.data.images[0].url, caption: '<b>Al</b>pha' }] } })
  const before = editor.save().blocks
  const spec = { key: 'image:first:caption' }
  let field = focusedField(editor, spec, 'end')
  equal(field.querySelector('b')?.textContent, 'Al', 'Gallery discarded caption formatting in its projection')
  await printable('X')
  const after = editor.save().blocks
  equal(after[0].data.images[0].caption, '<b>Al</b>phaX')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  field = document.activeElement
  equal(field.querySelector('b')?.textContent, 'Al')
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  equal(document.activeElement.querySelector('b')?.textContent, 'Al')
})

test('Raw Tab indents selected HTML lines without replacing the source', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Raw')
  const editor = pluginEditor({ ...fixture, data: { html: 'Alpha\nBravo' } })
  const before = editor.save().blocks
  focusedField(editor, { key: 'html' }, 'start')
  await dispatchKey('a', 'KeyA', 65, 2)
  await dispatchKey('Tab', 'Tab', 9)
  const after = editor.save().blocks
  equal(after[0].data.html, '  Alpha\n  Bravo')
  equal([document.activeElement.selectionStart, document.activeElement.selectionEnd], [0, 15])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  await dispatchKey('Tab', 'Tab', 9, 8)
  equal(editor.save().blocks, before)
})

test('Code edit control describes and toggles its current mode', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Code')
  const editor = pluginEditor(fixture)
  const button = blockElement(editor, 'a').querySelector('.oe-code-btn--edit')
  equal(button.getAttribute('aria-label'), 'Edit')
  await clickNative(button)
  equal(button.getAttribute('aria-label'), 'Done')
  assert(button.querySelector('svg'), 'Code mode button lost its icon')
  await clickNative(button)
  equal(button.getAttribute('aria-label'), 'Edit')
  equal(editor.canUndo, false)
})

for (const fixture of pluginParityFixtures) {
  test(`${fixture.name}: read-only authoring preserves canonical data`, async () => {
    const editor = pluginEditor(fixture)
    const before = editor.save().blocks
    editor.setReadOnly(true)
    equal(blockElement(editor, 'a').querySelectorAll('[contenteditable="true"]').length, 0)
    for (const input of blockElement(editor, 'a').querySelectorAll('input[type="url"],input[type="text"],textarea')) {
      if (input.closest('.oe-source-editor[aria-hidden="true"]')) continue
      assert(input.readOnly || input.disabled || input.hidden || input.closest('[inert]'), 'Read-only plugin leaves an authoring control editable')
    }
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    editor.setReadOnly(false)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}

for (const fixture of pluginParityFixtures.filter(entry => ['Paragraph','Heading','List','Quote','Image','Table','Checklist','Warning','Embed','Carousel','Toggle','Columns','Spoiler','Poll','Person'].includes(entry.name))) {
  for (const spec of fixture.fields.filter(field => !field.key.endsWith('url') && !(fixture.name === 'Person' && !field.key.endsWith(':bio')))) {
    test(`${fixture.name} ${spec.key}: native Shift+Enter keeps a line break and caret`, async () => {
      const editor = pluginEditor(fixture)
      const before = editor.save().blocks
      focusedField(editor, spec, 2)
      await dispatchKey('Enter', 'Enter', 13, 8)
      const after = editor.save().blocks
      equal(after[0].data, writePath(before[0].data, spec.path, spec.value.slice(0, 2) + '<br>' + spec.value.slice(2)))
      checkFieldCaret(document.activeElement, 3)
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      await dispatchKey('z', 'KeyZ', 90, 2 | 8)
      equal(editor.save().blocks, after)
      checkFieldCaret(document.activeElement, 3)
      await printable('X')
      equal(readPath(editor.save().blocks[0].data, spec.path), spec.value.slice(0, 2) + '<br>X' + spec.value.slice(2))
    })
  }
}

test('Poll preserves rich question and option formatting through native typing and line breaks', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Poll')
  const editor = pluginEditor({ ...fixture, data: { ...fixture.data, question: '<b>Al</b>pha', options: [{ id: 'first', text: '<i>Br</i>avo' }, { id: 'second', text: 'Charlie' }] } })
  const before = editor.save().blocks
  const question = focusedField(editor, { key: 'question' }, 'end')
  assert(question.querySelector('b'), 'Poll displayed author HTML as literal plain text')
  await printable('X')
  equal(editor.save().blocks[0].data.question, '<b>Al</b>phaX')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  focusedField(editor, { key: 'option:first' }, 3)
  await dispatchKey('Enter', 'Enter', 13, 8)
  equal(editor.save().blocks[0].data.options[0].text, '<i>Br</i>a<br>vo')
  checkFieldCaret(document.activeElement, 4)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

async function convertThroughMenu(editor, target, beforeMenu = null) {
  editor.blocks.focus('a')
  await pause(30)
  beforeMenu?.()
  await clickNative(editorRoot(editor).querySelector('.oe-toolbar__drag'))
  await pause(180)
  const menu = editorRoot(editor).querySelector('.oe-settings-menu')
  await clickNative(menu.querySelector('[data-menu-convert]'))
  await pause(180)
  await clickNative(menu.querySelector(`[data-plugin-type="${target}"]`))
  await pause(25)
}

test('selected plain-text Code input converts the whole block rather than slicing its text', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Code')
  const editor = pluginEditor(fixture)
  const before = editor.save().blocks
  await convertThroughMenu(editor, 'paragraph', () => {
    const input = document.activeElement
    assert(input?.tagName === 'TEXTAREA' && input.value === 'Alpha', 'Code focus did not enter its source field')
    input.setSelectionRange(1, 4)
  })
  const after = editor.save().blocks
  equal(after.map(block => [block.id, block.type, block.data.text]), [['a', 'paragraph', 'Alpha']])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
})

for (const fixture of pluginParityFixtures.filter(entry => entry.name !== 'Paragraph' && entry.name !== 'Delimiter')) {
  test(`${fixture.name}: whole conversion to Paragraph transfers text and one Undo/Redo`, async () => {
    const editor = pluginEditor(fixture)
    const before = editor.save().blocks
    await convertThroughMenu(editor, 'paragraph')
    const after = editor.save().blocks
    equal(after.map(block => [block.id, block.type, block.data.text]), [['a', 'paragraph', fixture.exportedText]])
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    caret(document.activeElement, 0)
  })
}

test('Gallery fixed layout projects its slots and keeps extra images in overflow', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Gallery')
  const editor = pluginEditor({ ...fixture, data: { ...fixture.data, layout: '3a' } })
  const grid = blockElement(editor, 'a').querySelector('.oe-gallery__grid')
  assert(grid.classList.contains('eg--3a'), 'Gallery layout exists only in JSON')
  equal(grid.querySelectorAll('.oe-gallery__slot').length, 3)
  equal(grid.querySelectorAll('.oe-gallery__slot--empty').length, 1)
  editor.blocks.update('a', current => ({ data: { ...current.data, layout: '1' } }))
  const next = blockElement(editor, 'a')
  equal(next.querySelector('.oe-gallery__grid').querySelectorAll('.oe-gallery__slot--filled').length, 1)
  equal(next.querySelector('.oe-gallery__overflow').querySelectorAll(':scope > [data-image-id]').length, 1)
  equal(editor.save().blocks[0].data.images.map(image => image.id), ['first', 'second'])
})

test('Gallery caption Enter finishes its single-line editing as in v1', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Gallery')
  const editor = pluginEditor(fixture)
  const before = editor.save().blocks
  const field = focusedField(editor, fixture.fields[0], 2)
  await dispatchKey('Enter', 'Enter', 13)
  equal(editor.save().blocks, before)
  assert(document.activeElement !== field, 'Gallery Enter did not finish caption editing')
  assert(editorRoot(editor).contains(document.activeElement), 'Caption exit lost editor keyboard ownership')
  equal(editor.canUndo, false)
})

test('Poll Sort keeps option IDs and sorts author text as one action', async () => {
  const editor = poll([{ id: 'first', text: 'Zulu' }, { id: 'second', text: 'Alpha' }])
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'question', offset: 'start' })
  await clickNative(editorRoot(editor).querySelector('.oe-toolbar__drag'))
  const menu = editorRoot(editor).querySelector('.oe-settings-menu')
  const sort = [...menu.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === 'Sort')
  assert(sort, 'Poll Sort from v1 is missing')
  await clickNative(sort)
  const after = editor.save().blocks
  equal(after[0].data.options, [{ id: 'second', text: 'Alpha' }, { id: 'first', text: 'Zulu' }])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
})

test('Paragraph middle input Undo restores the caret before the native mutation', async () => {
  const editor = make([para('a', 'Alpha')])
  editor.blocks.focus('a', { fieldKey: 'text', offset: 2 })
  await printable('X')
  equal(editor.save().blocks[0].data.text, 'AlXpha')
  caret(document.activeElement, 3)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.text, 'Alpha')
  caret(document.activeElement, 2)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks[0].data.text, 'AlXpha')
  caret(document.activeElement, 3)
})

test('Code whole conversion to Heading preserves literal text and native history', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Code')
  const editor = pluginEditor(fixture, { plugins: [createParagraphPlugin(), createHeadingPlugin(), createCodePlugin()] })
  const before = editor.save().blocks
  await convertThroughMenu(editor, 'heading')
  const after = editor.save().blocks
  equal(after.map(block => [block.id, block.type, block.data.text]), [['a', 'heading', 'Alpha']])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
})

const richTargets = {
  Paragraph: ['text'], Heading: ['text'], List: ['items', '0', 'text'],
  Checklist: ['items', '0', 'text'], Quote: ['text'], Warning: ['message'],
  Table: ['rows', '0', 'cells', '0', 'text'], Toggle: ['content'],
  Spoiler: ['content'], Columns: ['columns', '0', 'content'],
  Person: ['persons', '0', 'bio'], Image: ['caption'], Embed: ['caption'],
}
for (const target of pluginParityFixtures.filter(fixture => richTargets[fixture.name])) {
  test(`Literal source conversion to ${target.name} keeps markup as text and newlines`, async () => {
    const source = pluginParityFixtures.find(fixture => fixture.name === 'Code')
    const definition = target.factory()
    const editor = pluginEditor({ ...source, data: { code: '<b>Alpha</b>\nBravo', language: 'plaintext' } }, {
      plugins: [createParagraphPlugin(), createCodePlugin(), ...(target.name === 'Paragraph' ? [] : [definition])],
    })
    const before = editor.save().blocks
    await convertThroughMenu(editor, definition.type)
    const after = editor.save().blocks
    equal(after[0].type, definition.type)
    equal(readPath(after[0].data, richTargets[target.name]), '&lt;b&gt;Alpha&lt;/b&gt;<br>Bravo')
    if (target.name === 'Image') {
      // A converted Image without a source has no caption editing field yet.
      // Its source button retains native ownership; the editor root remains
      // the authorized history surface for this fieldless block.
      assert(document.activeElement?.matches('button'), 'Empty Image must focus its source control')
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, after, 'An auxiliary Image source button intercepted canonical Undo')
      editorRoot(editor).focus()
      assert(document.activeElement === editorRoot(editor), 'Editor chrome did not receive history focus')
    }
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
  })
}

test('Raw preview preserves the source and permits native history from its preview state',async()=>{
  const fixture=pluginParityFixtures.find(entry=>entry.name==='Raw')
  const editor=pluginEditor(fixture)
  const before=editor.save().blocks
  focusedField(editor,{key:'html'},'end')
  await printable('X')
  const after=editor.save().blocks
  await clickNative(blockElement(editor,'a').querySelector('.oe-raw__toggle'))
  const frame=blockElement(editor,'a').querySelector('iframe')
  assert(frame&&frame.getAttribute('sandbox')==='','Raw preview lost its iframe')
  equal(frame.srcdoc,'AlphaX')
  assert(frame.getBoundingClientRect().height>=100,'Preview lost its visible height')
  equal(editor.save().blocks,after)
  await dispatchKey('z','KeyZ',90,2)
  equal(editor.save().blocks,before,'Preview stranded native Undo outside the editor')
  equal(document.activeElement,blockElement(editor,'a').querySelector('textarea'))
  await dispatchKey('z','KeyZ',90,2|8)
  equal(editor.save().blocks,after)
})

test('Table heading cells follow row reordering through public update and history', async () => {
  const definition = createTablePlugin()
  const initial = {
    withHeadings: true,
    rows: [
      { id: 'first', cells: [{ id: 'a', text: 'Alpha' }] },
      { id: 'second', cells: [{ id: 'b', text: 'Bravo' }] },
    ],
  }
  const editor = make([{ id: 'a', type: 'table', dataVersion: definition.schema.currentVersion, data: initial }],
    { plugins: [createParagraphPlugin(), definition] })
  const tags = () => [...blockElement(editor, 'a').querySelectorAll('.oe-table tr')].map(row => [
    row.dataset.rowId,
    row.firstElementChild?.tagName,
    row.firstElementChild?.textContent,
  ])
  const before = editor.save().blocks
  equal(tags(), [['first', 'TH', 'Alpha'], ['second', 'TD', 'Bravo']])
  editor.blocks.update('a', current => ({
    data: { ...current.data, rows: [...current.data.rows].reverse() },
  }))
  const reordered = editor.save().blocks
  equal(tags(), [['second', 'TH', 'Bravo'], ['first', 'TD', 'Alpha']])
  equal(reordered[0].data.rows.map(row => row.id), ['second', 'first'])
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
  equal(tags(), [['first', 'TH', 'Alpha'], ['second', 'TD', 'Bravo']])
  equal(editor.redo(), true)
  equal(editor.save().blocks, reordered)
  equal(tags(), [['second', 'TH', 'Bravo'], ['first', 'TD', 'Alpha']])
  editor.blocks.update('a', current => ({
    data: { ...current.data, rows: current.data.rows.slice(1) },
  }))
  equal(tags(), [['first', 'TH', 'Alpha']])
})

test('List: sibling data update retains native editing focus and caret', async () => {
  const definition = createListPlugin()
  const editor = make([{ id: 'a', type: 'list', dataVersion: definition.schema.currentVersion,
    data: { style: 'unordered', items: [{ id: 'one', text: 'Alpha' }, { id: 'two', text: 'Bravo' }] } }],
    { plugins: [createParagraphPlugin(), definition] })
  const field = focusedField(editor, { key: 'item:two' }, 2)
  checkFieldCaret(field, 2)
  editor.blocks.update('a', current => ({
    data: { ...current.data, items: current.data.items.map(item =>
      item.id === 'one' ? { ...item, text: 'Changed' } : item) },
  }))
  equal(document.activeElement, field, 'List moved an unchanged editable and blurred its focus')
  checkFieldCaret(field, 2)
  equal(editor.save().blocks[0].data.items.map(item => item.text), ['Changed', 'Bravo'])
  const after = editor.save().blocks
  await printable('X')
  equal(editor.save().blocks[0].data.items[1].text, 'BrXavo', 'List input moved to a wrong field')
  equal(editor.undo(), true)
  equal(editor.save().blocks, after)
})

test('Table: sibling cell update retains native editing focus and caret', async () => {
  const definition = createTablePlugin()
  const editor = make([{ id: 'a', type: 'table', dataVersion: definition.schema.currentVersion,
    data: { withHeadings: false, rows: [
      { id: 'top', cells: [{ id: 'left', text: 'Alpha' }, { id: 'right', text: 'Bravo' }] },
      { id: 'bottom', cells: [{ id: 'single', text: 'Charlie' }, { id: 'extra', text: 'Delta' }] },
    ] } }], { plugins: [createParagraphPlugin(), definition] })
  const field = focusedField(editor, { key: 'cell:top:right' }, 2)
  checkFieldCaret(field, 2)
  editor.blocks.update('a', current => ({
    data: { ...current.data, rows: current.data.rows.map(row => row.id === 'bottom'
      ? { ...row, cells: row.cells.map(cell => cell.id === 'single' ? { ...cell, text: 'Edited' } : cell) } : row) },
  }))
  equal(document.activeElement, field, 'Table reordered an unchanged editable and blurred its focus')
  checkFieldCaret(field, 2)
  equal(editor.save().blocks[0].data.rows[1].cells[0].text, 'Edited')
  const after = editor.save().blocks
  await printable('X')
  equal(editor.save().blocks[0].data.rows[0].cells[1].text, 'BrXavo', 'Table input moved to a wrong field')
  equal(editor.undo(), true)
  equal(editor.save().blocks, after)
})

test('Columns sibling update retains editing caret, typing and atomic history', async () => {
  const definition = createColumnsPlugin()
  const editor = make([{ id: 'a', type: definition.type,
    dataVersion: definition.schema.currentVersion, data: {
      layout: '1-1',
      columns: [{ id: 'left', content: 'Alpha' }, { id: 'right', content: 'Bravo' }],
    },
  }], { plugins: [createParagraphPlugin(), definition] })
  const field = focusedField(editor, { key: 'column:right' }, 2)
  const before = editor.save().blocks
  checkFieldCaret(field, 2)
  editor.blocks.update('a', current => ({
    data: { ...current.data,
      columns: current.data.columns.map(column => column.id === 'left'
        ? { ...column, content: 'Changed' } : column),
    },
  }))
  const afterSibling = editor.save().blocks
  equal(document.activeElement, field, 'Columns moved an unchanged editing host')
  checkFieldCaret(field, 2)
  equal(afterSibling[0].data.columns.map(column => column.content), ['Changed', 'Bravo'])
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.columns.map(column => column.content), ['Changed', 'BrXavo'])
  checkFieldCaret(field, 3)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterSibling)
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
  equal(editor.redo(), true)
  equal(editor.save().blocks, afterSibling)
  equal(editor.redo(), true)
  equal(editor.save().blocks, afterInput)
})

test('Columns layout-only update preserves active editing node and caret', async () => {
  const definition = createColumnsPlugin()
  const editor = make([{ id: 'a', type: definition.type,
    dataVersion: definition.schema.currentVersion, data: {
      layout: '1-1',
      columns: [{ id: 'left', content: 'Alpha' }, { id: 'right', content: 'Bravo' }],
    },
  }], { plugins: [createParagraphPlugin(), definition] })
  const field = focusedField(editor, { key: 'column:right' }, 3)
  editor.blocks.update('a', current => ({ data: { ...current.data, layout: '1-2' } }))
  equal(document.activeElement, field, 'Changing a grid layout discarded editing focus')
  checkFieldCaret(field, 3)
  equal(editor.save().blocks[0].data.layout, '1-2')
})


test('Person sibling update keeps the author caret and updates the current tab after native input', async () => {
  const definition = createPersonPlugin()
  const persons = [
    { id: 'one', avatar: '', name: 'Alpha', role: 'Owner', bio: '', links: [] },
    { id: 'two', avatar: '', name: 'Bravo', role: 'Writer', bio: '', links: [] },
  ]
  const editor = make([{ id: 'a', type: 'person', dataVersion: definition.schema.currentVersion,
    data: { persons } }], { plugins: [createParagraphPlugin(), definition] })
  const field = focusedField(editor, { key: 'person:one:name' }, 2)
  editor.blocks.update('a', current => ({ data: {
    persons: current.data.persons.map(person => person.id === 'two'
      ? { ...person, role: 'Editor' } : person),
  } }))
  equal(document.activeElement, field, 'Person detached the active field after the other record changed')
  checkFieldCaret(field, 2)
  const afterSibling = editor.save().blocks
  equal(afterSibling[0].data.persons[1].role, 'Editor')
  await printable('X')
  equal(editor.save().blocks[0].data.persons[0].name, 'AlXpha')
  const label = [...blockElement(editor, 'a').querySelectorAll('.oe-person__tab')]
    .find(tab => tab.dataset.personId === 'one')?.querySelector('.oe-person__tab-label')
  equal(label?.textContent, 'AlXpha', 'name input updated an obsolete, detached tab label')
  checkFieldCaret(field, 3)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, afterSibling)
})

test('Person reordering tabs does not replace the active author field', async () => {
  const definition = createPersonPlugin()
  const persons = [
    { id: 'one', avatar: '', name: 'Alpha', role: '', bio: '', links: [] },
    { id: 'two', avatar: '', name: 'Bravo', role: '', bio: '', links: [] },
  ]
  const editor = make([{ id: 'a', type: 'person', dataVersion: definition.schema.currentVersion,
    data: { persons } }], { plugins: [createParagraphPlugin(), definition] })
  const field = focusedField(editor, { key: 'person:one:bio' }, 0)
  editor.blocks.update('a', current => ({ data: { persons: [...current.data.persons].reverse() } }))
  equal(editor.save().blocks[0].data.persons.map(person => person.id), ['two', 'one'])
  equal(document.activeElement, field, 'tab reorder discarded the active Person field')
  checkFieldCaret(field, 0)
  await printable('Q')
  equal(editor.save().blocks[0].data.persons[1].bio, 'Q')
  checkFieldCaret(field, 1)
})


test('Carousel retains newer selection after moving the previously active slide', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Carousel')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data,
    slides: [
      { id: 'first', type: 'image', src: pixel, caption: 'Alpha', alt: '' },
      { id: 'second', type: 'image', src: pixel, caption: 'Bravo', alt: '' },
    ],
    options: { autoplay: false, navigation: true },
  } })
  const caption = () => blockElement(editor, 'a').querySelector('.oe-carousel-block__caption')
  const next = blockElement(editor, 'a').querySelector('[aria-label="Move slide forward"]')
  assert(next && !next.disabled, 'the active slide cannot be moved forward')
  next.click()
  equal(editor.save().blocks[0].data.slides.map(slide => slide.id), ['second', 'first'])
  // A previous move must not override a newer synchronous focus choice.
  editor.blocks.focus('a', { fieldKey: 'slide:second:caption', offset: 'start' })
  equal(caption()?.dataset.slideId, 'second')
  await Promise.resolve()
  editor.setReadOnly(true)
  equal(caption()?.dataset.slideId, 'second',
    'old move microtask overwrote a newer active slide choice during redraw')
  equal(caption()?.textContent, 'Bravo')
  equal(editor.save().blocks[0].data.slides.map(slide => slide.id), ['second', 'first'])
})


test('Gallery retired controls cannot mutate current authoring data after a view refresh', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Gallery')
  const editor = pluginEditor(fixture)
  const block = () => blockElement(editor, 'a')
  const oldRemove = block().querySelector('.oe-gallery__slot-remove')
  const oldClear = [...block().querySelectorAll('.oe-gallery__action-btn')]
    .find(button => button.textContent?.includes('Delete all'))
  assert(oldRemove && oldClear, 'Gallery is missing its authoring controls')
  editor.blocks.update('a', current => ({
    data: { ...current.data, layout: '2' },
  }))
  const after = editor.save().blocks
  assert(!oldRemove.isConnected && !oldClear.isConnected, 'Gallery did not retire the former view')
  oldRemove.click()
  oldClear.click()
  equal(editor.save().blocks, after, 'stale Gallery controls modified the canonical document')
  const liveRemove = block().querySelector('.oe-gallery__slot-remove')
  assert(liveRemove && liveRemove !== oldRemove)
  liveRemove.click()
  equal(editor.save().blocks[0].data.images.length, 1, 'active Gallery remove button stopped working')
})


test('Attaches retired file controls cannot mutate authoring data after a view refresh', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Attaches')
  const editor = pluginEditor(fixture)
  const block = () => blockElement(editor, 'a')
  const oldRemove = block().querySelector('.oe-attaches__remove')
  const oldClear = [...block().querySelectorAll('.oe-attaches__action-btn')]
    .find(button => button.textContent?.includes('Delete all'))
  assert(oldRemove && oldClear, 'Attaches is missing its authoring controls')
  editor.blocks.update('a', current => ({
    data: { ...current.data, variant: 'b' },
  }))
  const updated = editor.save().blocks
  assert(!oldRemove.isConnected && !oldClear.isConnected, 'Attaches did not retire the previous view')
  oldRemove.click()
  oldClear.click()
  equal(editor.save().blocks, updated, 'retired Attaches controls modified canonical data')
  const liveRemove = block().querySelector('.oe-attaches__remove')
  assert(liveRemove && liveRemove !== oldRemove)
  liveRemove.click()
  equal(editor.save().blocks[0].data.files.length, 0, 'current Attaches remove button stopped working')
})


test('Gallery style-only update preserves native caption caret and history', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Gallery')
  const editor = pluginEditor(fixture)
  const field = focusedField(editor, { key: 'image:first:caption' }, 2)
  const before = editor.save().blocks
  const originalGallery = blockElement(editor, 'a').querySelector('.oe-gallery')
  const originalGapInput = [...originalGallery.querySelectorAll('.oe-gallery__dropdown-panel label')]
    .find(label => label.querySelector(':scope > span')?.textContent === 'Gap')
    ?.querySelector('input')
  assert(originalGapInput, 'Gallery settings lack the gap field')
  editor.blocks.update('a', current => ({
    data: { ...current.data, styles: { ...current.data.styles,
      gap: '12px', borderRadius: '8px', height: '220px',
    } },
  }))
  const afterStyle = editor.save().blocks
  equal(document.activeElement, field, 'Gallery style-only update blurred caption editing')
  checkFieldCaret(field, 2)
  const gallery = blockElement(editor, 'a').querySelector('.oe-gallery')
  equal(gallery.style.gap, '12px')
  const grid = gallery.querySelector('.oe-gallery__grid')
  equal(grid.style.gap, '12px')
  equal(grid.style.height, '220px')
  equal(grid.querySelector('.oe-gallery__slot--filled')?.style.borderRadius, '8px')
  const settingValue = label => [...gallery.querySelectorAll('.oe-gallery__dropdown-panel label')]
    .find(node => node.querySelector(':scope > span')?.textContent === label)
    ?.querySelector('input,select')?.value
  equal(settingValue('Gap'), '12px', 'hidden Gallery settings retained an outdated gap value')
  equal([...gallery.querySelectorAll('.oe-gallery__dropdown-panel label')]
    .find(label => label.querySelector(':scope > span')?.textContent === 'Gap')?.querySelector('input'),
    originalGapInput, 'Gallery style update replaced a live settings input unnecessarily')
  equal(settingValue('Border radius'), '8px', 'hidden Gallery settings retained an outdated radius')

  await printable('X')
  equal(editor.save().blocks[0].data.images[0].caption, 'AlXpha',
    'Gallery typed input into a stale or incorrect caption')
  checkFieldCaret(field, 3)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterStyle)
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
})

test('Gallery identical and style-removal updates do not replace the focused caption', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Gallery')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data, styles: { gap: '12px', borderRadius: '8px' },
  } })
  const field = focusedField(editor, { key: 'image:first:caption' }, 2)
  const initial = editor.save().blocks
  editor.blocks.update('a', current => ({ data: structuredClone(current.data) }))
  equal(editor.save().blocks, initial, 'identical Gallery update changed author data')
  equal(document.activeElement, field, 'identical Gallery data update discarded focus')
  checkFieldCaret(field, 2)
  editor.blocks.update('a', current => ({ data: { ...current.data, styles: {} } }))
  equal(document.activeElement, field, 'Gallery style removal discarded focus')
  checkFieldCaret(field, 2)
  const gallery = blockElement(editor, 'a').querySelector('.oe-gallery')
  equal(gallery.style.gap, '')
  equal(gallery.querySelector('.oe-gallery__grid').style.gap, '')
  equal(gallery.querySelector('.oe-gallery__slot--filled').style.borderRadius, '')
  const gap = [...gallery.querySelectorAll('.oe-gallery__dropdown-panel label')]
    .find(label => label.querySelector(':scope > span')?.textContent === 'Gap')
    ?.querySelector('input')
  equal(gap?.value, '', 'Gallery hidden settings did not clear the removed gap')
})


test('Carousel inactive slide caption changes preserve active editing and settings', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Carousel')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data,
    slides: [
      { id: 'first', type: 'image', src: pixel, alt: '', caption: 'Alpha' },
      { id: 'second', type: 'image', src: pixel, alt: 'Second', caption: 'Bravo' },
    ],
  } })
  const field = focusedField(editor, { key: 'slide:first:caption' }, 2)
  const before = editor.save().blocks
  editor.blocks.update('a', current => ({ data: {
    ...current.data,
    slides: current.data.slides.map(slide => slide.id === 'second'
      ? { ...slide, caption: 'Updated caption' } : slide),
  } }))
  const after = editor.save().blocks
  equal(document.activeElement, field, 'Carousel replaced the focused caption for an inactive slide update')
  checkFieldCaret(field, 2)
  const picker = blockElement(editor, 'a').querySelector('.oe-carousel-block__slide-select')
  const secondOption = [...picker.options].find(option => option.value === 'second')
  equal(secondOption?.textContent, '2 · Updated caption',
    'Carousel hidden settings picker kept the old inactive slide caption')
  await printable('X')
  equal(editor.save().blocks[0].data.slides[0].caption, 'AlXpha',
    'Carousel typed into an obsolete editing field')
  checkFieldCaret(field, 3)
  equal(editor.undo(), true)
  equal(editor.save().blocks, after)
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
})

test('Carousel active slide changes still redraw authoring data', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Carousel')
  const editor = pluginEditor(fixture)
  const field = focusedField(editor, { key: 'slide:first:caption' }, 2)
  editor.blocks.update('a', current => ({ data: {
    ...current.data,
    slides: current.data.slides.map(slide => ({ ...slide, caption: 'Replaced author text' })),
  } }))
  const next = blockElement(editor, 'a').querySelector('.oe-carousel-block__caption')
  assert(next !== field, 'active caption change failed to reproject author text')
  equal(next.textContent, 'Replaced author text')
  equal(editor.save().blocks[0].data.slides[0].caption, 'Replaced author text')
})


test('Carousel settings edit the currently active slide after navigation', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Carousel')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data,
    slides: [
      { id: 'first', type: 'image', src: pixel, alt: 'First image', caption: 'Alpha' },
      { id: 'second', type: 'image', src: pixel, alt: 'Second image', caption: 'Bravo' },
    ],
  } })
  focusedField(editor, { key: 'slide:second:caption' }, 2)
  const settingsPanel = () => blockElement(editor, 'a').querySelector('.oe-carousel-block__dropdown-panel')
  const picker = settingsPanel().querySelector('.oe-carousel-block__slide-select')
  equal(picker.value, 'second', 'Carousel settings selected the first instead of the active slide')
  const altField = [...settingsPanel().querySelectorAll('label')]
    .find(label => label.querySelector(':scope > span')?.textContent === 'Alternative text')
    ?.querySelector('input')
  assert(altField, 'Current slide lacks alternative-text settings')
  equal(altField.value, 'Second image', 'Carousel settings show metadata of a different slide')
  altField.value = 'Changed second image'
  altField.dispatchEvent(new Event('change', { bubbles: true }))
  const saved = editor.save().blocks[0].data.slides
  equal(saved[0].alt, 'First image', 'Carousel edited a nonactive slide')
  equal(saved[1].alt, 'Changed second image', 'Carousel lost active-slide settings change')
  equal(settingsPanel().querySelector('.oe-carousel-block__slide-select').value, 'second',
    'Carousel settings selection reset after committing active-slide metadata')
})

test('Carousel settings follow active-slide navigation in both directions', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Carousel')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data,
    slides: [
      { id: 'first', type: 'image', src: pixel, alt: 'First', caption: 'Alpha' },
      { id: 'second', type: 'image', src: pixel, alt: 'Second', caption: 'Bravo' },
    ],
  } })
  const selectedSettings = () => blockElement(editor, 'a')
    .querySelector('.oe-carousel-block__slide-select')?.value
  equal(selectedSettings(), 'first')
  editor.blocks.focus('a', { fieldKey: 'slide:second:caption', offset: 'start' })
  equal(selectedSettings(), 'second', 'navigating forward did not select the current settings slide')
  editor.blocks.focus('a', { fieldKey: 'slide:first:caption', offset: 'start' })
  equal(selectedSettings(), 'first', 'navigating backward did not select the current settings slide')
})


test('Carousel manually selected settings slide survives metadata save', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Carousel')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data,
    slides: [
      { id: 'first', type: 'image', src: pixel, alt: 'First image', caption: 'Alpha' },
      { id: 'second', type: 'image', src: pixel, alt: 'Second image', caption: 'Bravo' },
    ],
  } })
  const panel = () => blockElement(editor, 'a').querySelector('.oe-carousel-block__settings-panel')
  const picker = panel().querySelector('.oe-carousel-block__slide-select')
  equal(picker.value, 'first', 'initial settings selection is incorrect')
  picker.value = 'second'
  picker.dispatchEvent(new Event('change', { bubbles: true }))
  equal(panel().querySelector('.oe-carousel-block__slide-select').value, 'second')
  const altField = [...panel().querySelectorAll('label')]
    .find(label => label.querySelector(':scope > span')?.textContent === 'Alternative text')
    ?.querySelector('input')
  assert(altField)
  equal(altField.value, 'Second image')
  altField.value = 'Edited second'
  altField.dispatchEvent(new Event('change', { bubbles: true }))
  equal(editor.save().blocks[0].data.slides.map(slide => slide.alt),
    ['First image', 'Edited second'])
  equal(panel().querySelector('.oe-carousel-block__slide-select').value, 'second',
    'editing a slide from the selector reset the selection to a different slide')
})


test('Carousel retired settings inputs cannot mutate prior slide after picker changes', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Carousel')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data,
    slides: [
      { id: 'first', type: 'image', src: pixel, caption: 'Alpha', alt: 'First image' },
      { id: 'second', type: 'image', src: pixel, caption: 'Bravo', alt: 'Second image' },
    ],
  } })
  const panel = () => blockElement(editor, 'a').querySelector('.oe-carousel-block__settings-panel')
  const altInput = () => [...panel().querySelectorAll('label')]
    .find(label => label.querySelector(':scope > span')?.textContent === 'Alternative text')
    ?.querySelector('input')
  const stale = altInput()
  assert(stale && stale.value === 'First image', 'Carousel first slide settings missing')
  const picker = panel().querySelector('.oe-carousel-block__slide-select')
  picker.value = 'second'
  picker.dispatchEvent(new Event('change', { bubbles: true }))
  equal(altInput()?.value, 'Second image')

  const before = editor.save().blocks
  stale.value = 'Stale first slide edit'
  stale.dispatchEvent(new Event('change', { bubbles: true }))
  equal(editor.save().blocks, before, 'retired Carousel settings edited an unrelated slide')

  const second = altInput()
  second.value = 'Updated second'
  second.dispatchEvent(new Event('change', { bubbles: true }))
  equal(editor.save().blocks[0].data.slides.map(slide => slide.alt),
    ['First image', 'Updated second'], 'active settings edit did not target its selected slide')
  const current = editor.save().blocks
  second.value = 'Late obsolete edit'
  second.dispatchEvent(new Event('change', { bubbles: true }))
  equal(editor.save().blocks, current, 'old settings input remained authoritative after metadata commit')
})


for (const name of ['Image', 'Gallery', 'Carousel', 'Person', 'Attaches', 'Embed', 'LinkPreview']) {
  test(`${name}: native media author edits survive read-only transitions`, async () => {
    const fixture = pluginParityFixtures.find(item => item.name === name)
    const fieldSpec = fixture.fields.find(field =>
      name === 'Person' ? field.key.endsWith(':bio')
        : name === 'Attaches' ? field.key.endsWith(':name')
          : name === 'LinkPreview' ? field.key === 'url'
            : field.key === 'caption' || field.key.endsWith(':caption'))
    assert(fieldSpec, `${name} is missing a caption/name fixture`)
    const editor = pluginEditor(fixture)
    const initial = editor.save().blocks
    focusedField(editor, fieldSpec, 'end')
    await printable('X')
    const authored = editor.save().blocks
    equal(readPath(authored[0].data, fieldSpec.path), fieldSpec.value + 'X')
    editor.setReadOnly(true)
    equal(editor.save().blocks, authored, `${name} modified canonical input when switching to read-only`)
    editor.setReadOnly(false)
    const field = focusedField(editor, fieldSpec, 'end')
    const displayed = typeof field.value === 'string' ? field.value : field.textContent
    equal(displayed, fieldSpec.value + 'X',
      `${name} reprojected stale author text after its read-only transition`)
    await printable('Y')
    equal(readPath(editor.save().blocks[0].data, fieldSpec.path), fieldSpec.value + 'XY',
      `${name} overwrote committed native input after changing read-only mode`)
    assert(editor.canUndo, `${name} native input did not reach history`)
    assert(JSON.stringify(initial) !== JSON.stringify(authored))
  })
}


test('Gallery accepts a file drag after a caption update retains its image slots', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Gallery')
  const editor = pluginEditor(fixture)
  const root = blockElement(editor, 'a').querySelector('.oe-gallery')
  const source = root.querySelector('.oe-gallery__slot[data-image-id="first"]')
  assert(source, 'Gallery source slot is missing')
  const internal = new DataTransfer()
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: internal }))
  const target = root.querySelector('.oe-gallery__slot[data-image-id="second"]')
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: internal }))
  assert(source.classList.contains('oe-gallery__item--dragging'))
  assert(target.classList.contains('oe-gallery__slot--over')
    || target.classList.contains('oe-gallery__overflow-item--over'))
  editor.blocks.update('a', current => ({
    data: { ...current.data, images: current.data.images.map(image =>
      image.id === 'second' ? { ...image, caption: 'Updated second' } : image) },
  }))
  equal(root.querySelector('.oe-gallery__slot[data-image-id="first"]'), source,
    'caption-only projection replaced the drag source')
  // A constructed DataTransfer ignores dropEffect writes in Chromium. Record
  // the dragover protocol explicitly; the drop cases below use real files.
  const transfer = { types: ['Files'], dropEffect: 'none' }
  const over = new Event('dragover', { bubbles: true, cancelable: true })
  Object.defineProperty(over, 'dataTransfer', { value: transfer })
  target.dispatchEvent(over)
  assert(over.defaultPrevented, 'old image drag prevented a fresh file drop after Gallery projection')
  equal(transfer.dropEffect, 'copy')
  assert(!root.querySelector('.oe-gallery__item--dragging,.oe-gallery__slot--over,.oe-gallery__overflow-item--over'),
    'foreign file drag retained the preceding image-reorder decorations')
  equal(editor.save().blocks[0].data.images.map(image => image.id), ['first', 'second'])
})

for (const destination of ['wrapper', 'image slot']) {
  test(`Gallery file drop on the ${destination} supersedes an interrupted retained image drag`, async () => {
    const fixture = pluginParityFixtures.find(item => item.name === 'Gallery')
    const uploads = []
    const editor = pluginEditor({ ...fixture, factory: () => fixture.factory({
      uploadFile: async file => {
        uploads.push(file.name)
        return { url: pixel, alt: 'Dropped external image' }
      },
    }) })
    const root = blockElement(editor, 'a').querySelector('.oe-gallery')
    const source = root.querySelector('.oe-gallery__slot[data-image-id="first"]')
    source.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer: new DataTransfer(),
    }))
    editor.blocks.update('a', current => ({ data: {
      ...current.data,
      images: current.data.images.map(image => image.id === 'second'
        ? { ...image, caption: 'Updated second' } : image),
    } }))
    const beforeDrop = editor.save().blocks
    equal(root.querySelector('.oe-gallery__slot[data-image-id="first"]'), source)
    const transfer = new DataTransfer()
    transfer.items.add(new File(['image'], 'external.png', { type: 'image/png' }))
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
    const target = destination === 'wrapper' ? root
      : root.querySelector('.oe-gallery__slot[data-image-id="second"]')
    // No intervening dragover: drop must independently identify file delivery.
    target.dispatchEvent(drop)
    assert(drop.defaultPrevented, 'file drop was rejected because the previous reorder lacked dragend')
    await pause()
    equal(uploads, ['external.png'], 'file delivery did not invoke its upload provider exactly once')
    const afterDrop = editor.save().blocks
    equal(afterDrop[0].data.images.slice(0, 2), beforeDrop[0].data.images,
      'external file delivery reordered or replaced existing images')
    equal(afterDrop[0].data.images.length, 3)
    equal(afterDrop[0].data.images[2].caption, 'Dropped external image')
    equal(afterDrop[0].data.images[2].url, pixel)
    assert(!root.querySelector('.oe-gallery__item--dragging,.oe-gallery__slot--over,.oe-gallery__overflow-item--over'))
    equal(editor.undo(), true)
    equal(editor.save().blocks, beforeDrop, 'one Undo did not revert only the external file insertion')
    equal(editor.redo(), true)
    equal(editor.save().blocks, afterDrop)
    equal(uploads, ['external.png'], 'history replay repeated the file provider effect')
  })
}

test('Gallery retained image drag remains usable across a sibling caption update', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Gallery')
  const editor = pluginEditor(fixture)
  const root = blockElement(editor, 'a').querySelector('.oe-gallery')
  const source = root.querySelector('.oe-gallery__slot[data-image-id="first"]')
  const target = root.querySelector('.oe-gallery__slot[data-image-id="second"]')
  const transfer = new DataTransfer()
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  editor.blocks.update('a', current => ({ data: {
    ...current.data,
    images: current.data.images.map(image => image.id === 'second'
      ? { ...image, caption: 'Updated second' } : image),
  } }))
  const beforeDrop = editor.save().blocks
  equal(root.querySelector('.oe-gallery__slot[data-image-id="first"]'), source)
  equal(root.querySelector('.oe-gallery__slot[data-image-id="second"]'), target)
  const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer })
  target.dispatchEvent(over)
  assert(over.defaultPrevented, 'caption-only projection interrupted a still-live image drag')
  const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
  target.dispatchEvent(drop)
  assert(drop.defaultPrevented)
  equal(editor.save().blocks[0].data.images, [...beforeDrop[0].data.images].reverse())
  equal(editor.undo(), true)
  equal(editor.save().blocks, beforeDrop)
})

test('Gallery full view replacement retires its previous image drag listeners', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Gallery')
  const editor = pluginEditor(fixture)
  const root = blockElement(editor, 'a').querySelector('.oe-gallery')
  const source = root.querySelector('.oe-gallery__slot[data-image-id="first"]')
  const transfer = new DataTransfer()
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  editor.blocks.update('a', current => ({ data: { ...current.data, layout: '2' } }))
  assert(!source.isConnected, 'layout update did not retire the original drag source')
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  const target = root.querySelector('.oe-gallery__slot[data-image-id="second"]')
  const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer })
  target.dispatchEvent(over)
  assert(!over.defaultPrevented, 'a retired image listener acquired a new drag session')
  equal(editor.save().blocks[0].data.images.map(image => image.id), ['first', 'second'])
})

test('Person regenerated tabs reject a drag from the retired tab tree', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Person')
  const editor = pluginEditor({ ...fixture, data: {
    persons: [
      { id: 'first', name: 'Alpha', role: 'Writer', bio: '', avatar: '', links: [] },
      { id: 'second', name: 'Bravo', role: 'Editor', bio: '', avatar: '', links: [] },
    ],
  } })
  const tabs = blockElement(editor, 'a').querySelector('.oe-person__tabs')
  const source = tabs.querySelector('.oe-person__tab[data-person-id="first"]')
  assert(source)
  const start = new Event('dragstart', { bubbles: true, cancelable: true })
  Object.defineProperty(start, 'dataTransfer', { value: { setData() {}, effectAllowed: '' } })
  source.dispatchEvent(start)
  editor.blocks.update('a', current => ({
    data: { persons: current.data.persons.map(person => person.id === 'second'
      ? { ...person, role: 'Changed role' } : person) },
  }))
  const target = tabs.querySelector('.oe-person__tab[data-person-id="second"]')
  assert(target)
  const hover = new Event('dragover', { bubbles: true, cancelable: true })
  target.dispatchEvent(hover)
  assert(!hover.defaultPrevented, 'old Person tab drag survived rebuilding its source')
  const newStart = new Event('dragstart', { bubbles: true, cancelable: true })
  Object.defineProperty(newStart, 'dataTransfer', { value: { setData() {}, effectAllowed: '' } })
  tabs.querySelector('.oe-person__tab[data-person-id="first"]').dispatchEvent(newStart)
  const currentHover = new Event('dragover', { bubbles: true, cancelable: true })
  target.dispatchEvent(currentHover)
  assert(currentHover.defaultPrevented, 'fresh Person tab drag stopped working')
})


test('Gallery removing another image preserves a committed native caption edit', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Gallery')
  const editor = pluginEditor(fixture)
  focusedField(editor, { key: 'image:first:caption' }, 2)
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.images[0].caption, 'AlXpha')
  const slot = blockElement(editor, 'a').querySelector('.oe-gallery__slot[data-image-id="second"]')
  const remove = slot?.querySelector('.oe-gallery__slot-remove')
  assert(remove, 'second Gallery image lacks its Remove action')
  remove.click()
  const afterRemove = editor.save().blocks
  equal(afterRemove[0].data.images.map(item => [item.id, item.caption]), [['first', 'AlXpha']],
    'Gallery removed the native caption of a surviving image')
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput, 'Gallery removal could not be independently undone')
})

test('Attaches Undo and external reversion repaint the last canonical filename', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Attaches')
  const editor = pluginEditor(fixture)
  focusedField(editor, { key: 'file:first:name' }, 2)
  await printable('X')
  equal(editor.save().blocks[0].data.files[0].name, 'AlXpha')
  equal(editor.undo(), true)
  const shown = () => blockElement(editor, 'a').querySelector('.oe-attaches__name')
  equal(editor.save().blocks[0].data.files[0].name, 'Alpha')
  equal(shown()?.textContent, 'Alpha',
    'Attaches Undo restored canonical name but retained stale native field text')
  equal(editor.redo(), true)
  equal(shown()?.textContent, 'AlXpha')
  editor.blocks.update('a', current => ({
    data: { ...current.data, files: current.data.files.map(file =>
      file.id === 'first' ? { ...file, name: 'Alpha' } : file) },
  }))
  equal(editor.save().blocks[0].data.files[0].name, 'Alpha')
  equal(shown()?.textContent, 'Alpha',
    'Attaches external name reversion reused stale natively authored text')
})

test('Attaches keeps the active native filename caret when a sibling name changes', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Attaches')
  const first = fixture.data.files[0]
  const editor = pluginEditor({ ...fixture, data: { ...fixture.data, files: [
    first,
    { ...first, id: 'second', url: '/second.txt', name: 'Bravo' },
  ] } })
  const field = focusedField(editor, { key: 'file:first:name' }, 2)
  await printable('X')
  equal(editor.save().blocks[0].data.files[0].name, 'AlXpha')

  editor.blocks.update('a', current => ({
    data: {
      ...current.data,
      files: current.data.files.map(file => file.id === 'second'
        ? { ...file, name: 'Updated sibling' } : file),
    },
  }))
  equal(editor.save().blocks[0].data.files.map(file => file.name), ['AlXpha', 'Updated sibling'])
  assert(document.activeElement === field && field.isConnected,
    'sibling filename edit replaced the still-focused native editing host')
  checkFieldCaret(field, 3)
  await printable('Y')
  equal(editor.save().blocks[0].data.files.map(file => file.name), ['AlXYpha', 'Updated sibling'],
    'typing after sibling edit lost author text or selected the wrong file')
})

test('Attaches native deletion retains the latest non-empty filename like v1', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Attaches')
  const editor = pluginEditor(fixture)
  const initialName = editor.save().blocks[0].data.files[0].name
  assert(initialName.length > 0, 'Attaches fixture needs an authored filename')
  const field = focusedField(editor, { key: 'file:first:name' }, 'end')
  for (let index = 0; index < initialName.length; index++) {
    await dispatchKey('Backspace', 'Backspace', 8)
  }
  equal(field.textContent, '', 'native deletion did not clear the editing field')
  equal(editor.save().blocks[0].data.files[0].name, initialName.slice(0, 1),
    'an empty native field restored stale pre-edit data instead of the last non-empty name')
})

test('Attaches removing a different file preserves a committed native file name', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Attaches')
  const original = fixture.data.files[0]
  const editor = pluginEditor({ ...fixture, data: { ...fixture.data,
    files: [original, { ...original, id: 'second', url: '/second.txt', name: 'Bravo' }],
  } })
  focusedField(editor, { key: 'file:first:name' }, 2)
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.files[0].name, 'AlXpha')
  const remove = [...blockElement(editor, 'a').querySelectorAll('.oe-attaches__remove')][1]
  assert(remove, 'second Attaches file lacks its Remove action')
  remove.click()
  const afterRemove = editor.save().blocks
  equal(afterRemove[0].data.files.map(file => [file.id, file.name]), [['first', 'AlXpha']],
    'Attaches removal overwrote the previously committed native filename')
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput)
})

test('Image replacing source URL preserves native authored caption and one-step history', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Image')
  const editor = pluginEditor(fixture)
  focusedField(editor, { key: 'caption' }, 2)
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.caption, 'AlXpha')
  const wrapper = blockElement(editor, 'a')
  const replace = [...wrapper.querySelectorAll('.oe-image__action-btn')]
    .find(button => button.textContent?.includes('Replace'))
  assert(replace, 'Image source replacement action is missing')
  replace.click()
  const sourceUrl = [...wrapper.querySelectorAll('.oe-image__action-btn')]
    .find(button => button.textContent?.trim() === 'URL')
  assert(sourceUrl, 'Image URL replacement action is missing')
  sourceUrl.click()
  const sourceForm = wrapper.querySelector('.oe-source-editor__panel')
  assert(sourceForm, 'Image did not open its URL editor')
  const url = 'https://example.com/replacement.png'
  const field = sourceForm.querySelector('.oe-source-editor__field')
  field.value = url
  sourceForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  const afterReplace = editor.save().blocks
  equal(afterReplace[0].data.caption, 'AlXpha',
    'Image URL replacement overwrote previously committed native caption')
  equal(afterReplace[0].data.file.url, url)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput,
    'Image source replacement could not be undone without losing native caption')
})


test('Embed changing video URL preserves its native committed caption', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Embed')
  const editor = pluginEditor(fixture)
  focusedField(editor, { key: 'caption' }, 2)
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.caption, 'AlXpha')
  const wrapper = blockElement(editor, 'a')
  const replace = [...wrapper.querySelectorAll('.oe-embed__action-btn')]
    .find(button => button.textContent?.trim() === 'Replace')
  assert(replace, 'Embed source replacement action is missing')
  replace.click()
  const url = wrapper.querySelector('.oe-embed__url-input')
  const insert = [...wrapper.querySelectorAll('.oe-embed__action-btn')]
    .find(button => button.textContent?.trim() === 'Insert')
  assert(url && insert, 'Embed video URL editor is missing')
  url.value = 'https://youtu.be/9bZkp7q19f0'
  insert.click()
  const after = editor.save().blocks
  equal(after[0].data.videoId, '9bZkp7q19f0')
  equal(after[0].data.caption, 'AlXpha', 'Embed source replacement lost committed native caption')
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput, 'Embed source change could not be undone separately')
})


test('Embed native caption survives metadata and source updates without losing caret', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Embed')
  const editor = pluginEditor(fixture)
  const field = focusedField(editor, { key: 'caption' }, 2)
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.caption, 'AlXpha')
  checkFieldCaret(field, 3)

  editor.blocks.update('a', current => ({
    data: { ...current.data, title: 'Updated title', duration: '2:34' },
  }))
  const afterMetadata = editor.save().blocks
  equal(afterMetadata[0].data.caption, 'AlXpha')
  equal(blockElement(editor, 'a').querySelector('.oe-embed__caption'), field,
    'Embed metadata change detached the live native caption')
  equal(document.activeElement, field,
    'Embed metadata change moved focus from its native caption')
  checkFieldCaret(field, 3)
  equal(blockElement(editor, 'a').querySelector('.oe-embed__title')?.textContent, 'Updated title')
  equal(blockElement(editor, 'a').querySelector('.oe-embed__duration')?.textContent, '2:34')

  editor.blocks.update('a', current => ({
    data: { ...current.data, videoId: '9bZkp7q19f0' },
  }))
  const afterSource = editor.save().blocks
  equal(afterSource[0].data.caption, 'AlXpha')
  equal(afterSource[0].data.videoId, '9bZkp7q19f0')
  equal(blockElement(editor, 'a').querySelector('.oe-embed__caption'), field,
    'Embed source change detached an unchanged native caption')
  checkFieldCaret(field, 3)

  await printable('Y')
  equal(editor.save().blocks[0].data.caption, 'AlXYpha')
  checkFieldCaret(field, 4)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterSource)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterMetadata)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput)
})

test('Embed URL draft and pending parse survive an unrelated canonical update', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Embed')
  const editor = pluginEditor(fixture)
  const wrapper = blockElement(editor, 'a')
  const replace = [...wrapper.querySelectorAll('.oe-embed__action-btn')]
    .find(button => button.textContent?.trim() === 'Replace')
  assert(replace, 'Embed Replace action is missing')
  await clickNative(replace)
  const input = wrapper.querySelector('.oe-embed__url-input')
  assert(input && document.activeElement === input, 'Embed URL input was not focused')
  const draft = 'https://vimeo.com/123456'
  input.value = draft
  input.dispatchEvent(new Event('input', { bubbles: true }))

  editor.blocks.update('a', current => ({
    data: { ...current.data, title: 'Changed by host' },
  }))
  const afterMetadata = editor.save().blocks
  equal(input.value, draft, 'Embed metadata update erased a pending URL draft')
  equal(document.activeElement, input, 'Embed metadata update blurred the URL input')

  await pause(700)
  const afterSource = editor.save().blocks
  equal(afterSource[0].data.service, 'vimeo',
    'Embed metadata update canceled the pending valid URL parse')
  equal(afterSource[0].data.videoId, '123456')
  equal(afterSource[0].data.title, 'Changed by host')
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterMetadata,
    'URL parse was not a separate atomic action after the host update')
})

test('Embed clearing video removes its obsolete empty caption field', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Embed')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data, caption: '',
  } })
  const wrapper = blockElement(editor, 'a')
  const before = editor.save().blocks
  assert(wrapper.querySelector('.oe-embed__caption'),
    'configured Embed must expose an editable caption')

  editor.blocks.update('a', current => ({
    data: { ...current.data, service: '', videoId: '', caption: '' },
  }))
  assert(!wrapper.querySelector('.oe-embed__caption'),
    'empty Embed retained a stale caption after its last video was cleared')
  assert(!wrapper.querySelector('.oe-embed__player'),
    'empty Embed retained a stale video player')

  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
  assert(wrapper.querySelector('.oe-embed__caption'),
    'Undo failed to restore the configured Embed caption')
})

test('Gallery Undo and external reversion repaint the caption after retained native typing', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Gallery')
  const editor = pluginEditor(fixture)
  focusedField(editor, { key: 'image:first:caption' }, 2)
  await printable('X')
  const typed = editor.save().blocks
  equal(typed[0].data.images[0].caption, 'AlXpha')
  equal(editor.undo(), true)
  const original = editor.save().blocks
  equal(original[0].data.images[0].caption, 'Alpha')
  const shown = () => blockElement(editor, 'a')
    .querySelector('.oe-gallery__slot [data-image-id="first"][contenteditable]')
  equal(shown()?.innerHTML, 'Alpha',
    'Gallery Undo restored author data but left stale natively edited caption in DOM')
  equal(editor.redo(), true)
  equal(shown()?.innerHTML, 'AlXpha',
    'Gallery Redo did not restore the visually edited caption')
  editor.blocks.update('a', current => ({
    data: { ...current.data, images: current.data.images.map(image =>
      image.id === 'first' ? { ...image, caption: 'Alpha' } : image) },
  }))
  equal(editor.save().blocks[0].data.images[0].caption, 'Alpha')
  equal(shown()?.innerHTML, 'Alpha',
    'Gallery external caption reversion reused a stale native DOM value')
})

test('Gallery native caption then style update keeps the same editing host', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Gallery')
  const editor = pluginEditor(fixture)
  const field = focusedField(editor, { key: 'image:first:caption' }, 2)
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.images[0].caption, 'AlXpha')
  checkFieldCaret(field, 3)

  editor.blocks.update('a', current => ({
    data: { ...current.data, styles: { ...current.data.styles, gap: '12px' } },
  }))
  const afterStyle = editor.save().blocks
  equal(afterStyle[0].data.images[0].caption, 'AlXpha')
  equal(document.activeElement, field,
    'Gallery style update rebuilt the caption edited by native input')
  checkFieldCaret(field, 3)
  const grid = blockElement(editor, 'a').querySelector('.oe-gallery__grid')
  equal(grid.style.gap, '12px')
  await printable('Y')
  equal(editor.save().blocks[0].data.images[0].caption, 'AlXYpha')
  checkFieldCaret(field, 4)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterStyle)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput)
})

test('Carousel Undo and external reversion repaint the active caption after native typing', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Carousel')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data,
    slides: [
      { id: 'first', type: 'image', src: pixel, alt: '', caption: 'Alpha' },
      { id: 'second', type: 'image', src: pixel, alt: 'Second', caption: 'Bravo' },
    ],
  } })
  focusedField(editor, { key: 'slide:first:caption' }, 2)
  await printable('X')
  equal(editor.save().blocks[0].data.slides[0].caption, 'AlXpha')
  equal(editor.undo(), true)
  const shown = () => blockElement(editor, 'a')
    .querySelector('.oe-carousel-block__caption[data-slide-id="first"]')
  equal(editor.save().blocks[0].data.slides[0].caption, 'Alpha')
  equal(shown()?.innerHTML, 'Alpha',
    'Carousel Undo restored old author text without updating the active caption DOM')
  equal(editor.redo(), true)
  equal(shown()?.innerHTML, 'AlXpha',
    'Carousel Redo did not display the restored native caption')
  editor.blocks.update('a', current => ({
    data: { ...current.data, slides: current.data.slides.map(slide =>
      slide.id === 'first' ? { ...slide, caption: 'Alpha' } : slide) },
  }))
  equal(editor.save().blocks[0].data.slides[0].caption, 'Alpha')
  equal(shown()?.innerHTML, 'Alpha',
    'Carousel external caption reversion retained a stale native caption')
})

test('Carousel native caption then inactive slide edit keeps the active caret', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Carousel')
  const editor = pluginEditor({ ...fixture, data: {
    ...fixture.data,
    slides: [
      { id: 'first', type: 'image', src: pixel, alt: '', caption: 'Alpha' },
      { id: 'second', type: 'image', src: pixel, alt: 'Second', caption: 'Bravo' },
    ],
  } })
  const field = focusedField(editor, { key: 'slide:first:caption' }, 2)
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.slides[0].caption, 'AlXpha')
  checkFieldCaret(field, 3)

  editor.blocks.update('a', current => ({
    data: { ...current.data,
      slides: current.data.slides.map(slide => slide.id === 'second'
        ? { ...slide, caption: 'Updated Bravo' } : slide),
    },
  }))
  const afterSibling = editor.save().blocks
  equal(afterSibling[0].data.slides.map(slide => slide.caption),
    ['AlXpha', 'Updated Bravo'])
  equal(document.activeElement, field,
    'Carousel inactive slide edit rebuilt a natively edited caption')
  checkFieldCaret(field, 3)
  const picker = blockElement(editor, 'a').querySelector('.oe-carousel-block__slide-select')
  equal([...picker.querySelectorAll('option')].find(opt => opt.value === 'second')?.textContent,
    '2 · Updated Bravo')
  await printable('Y')
  equal(editor.save().blocks[0].data.slides[0].caption, 'AlXYpha')
  checkFieldCaret(field, 4)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterSibling)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput)
})


test('Person native name then sibling record update retains author caret', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Person')
  const editor = pluginEditor({ ...fixture, data: {
    persons: [
      { id: 'first', name: 'Alpha', role: 'Owner', bio: '', avatar: '', links: [] },
      { id: 'second', name: 'Bravo', role: 'Writer', bio: '', avatar: '', links: [] },
    ],
  } })
  const field = focusedField(editor, { key: 'person:first:name' }, 2)
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.persons[0].name, 'AlXpha')
  checkFieldCaret(field, 3)

  editor.blocks.update('a', current => ({ data: {
    persons: current.data.persons.map(person => person.id === 'second'
      ? { ...person, role: 'Editor' } : person),
  } }))
  const afterSibling = editor.save().blocks
  equal(afterSibling[0].data.persons[0].name, 'AlXpha')
  equal(document.activeElement, field, 'Person replaced natively edited authoring host')
  checkFieldCaret(field, 3)
  await printable('Y')
  equal(editor.save().blocks[0].data.persons[0].name, 'AlXYpha')
  checkFieldCaret(field, 4)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterSibling)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput)
})

test('Person native link edit then sibling update retains the URL input', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Person')
  const original = 'https://example.com/Alpha'
  const editor = pluginEditor({ ...fixture, data: {
    persons: [
      { id: 'first', name: 'Alpha', role: '', bio: '', avatar: '',
        links: [{ id: 'site', type: 'website', url: original }] },
      { id: 'second', name: 'Bravo', role: '', bio: '', avatar: '', links: [] },
    ],
  } })
  const field = focusedField(editor, { key: 'person:first:link:site:url' }, 'end')
  await printable('X')
  const afterInput = editor.save().blocks
  equal(afterInput[0].data.persons[0].links[0].url, original + 'X')

  editor.blocks.update('a', current => ({ data: {
    persons: current.data.persons.map(person => person.id === 'second'
      ? { ...person, role: 'Writer' } : person),
  } }))
  const afterSibling = editor.save().blocks
  equal(document.activeElement, field, 'Person replaced the natively edited URL field')
  checkFieldCaret(field, (original + 'X').length)
  await printable('Y')
  equal(editor.save().blocks[0].data.persons[0].links[0].url, original + 'XY')
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterSibling)
  equal(editor.undo(), true)
  equal(editor.save().blocks, afterInput)
})


test('Image retired settings inputs cannot overwrite canonical styles or toggles', async () => {
  const fixture = pluginParityFixtures.find(entry => entry.name === 'Image')
  const editor = pluginEditor(fixture)
  const getControl = label => {
    const form = blockElement(editor, 'a').querySelector('.oe-image__style-form')
    return [...form.querySelectorAll('label')]
      .find(row => row.querySelector('span')?.textContent === label)
      ?.querySelector('input,select')
  }
  const oldHeight = getControl('Height')
  const oldExpanded = getControl('Expanded')
  assert(oldHeight && oldExpanded, 'Image settings are missing expected controls')

  editor.blocks.update('a', current => ({
    data: {
      ...current.data,
      expanded: true,
      styles: { ...current.data.styles, height: '220px' },
    },
  }))
  const afterHostUpdate = editor.save().blocks
  equal(getControl('Height')?.value, '220px')
  equal(getControl('Expanded')?.checked, true)
  assert(getControl('Height') !== oldHeight && getControl('Expanded') !== oldExpanded,
    'Image did not replace its settings controls during projection')

  oldHeight.value = '999px'
  oldHeight.dispatchEvent(new Event('change', { bubbles: true }))
  oldExpanded.checked = false
  oldExpanded.dispatchEvent(new Event('change', { bubbles: true }))
  equal(editor.save().blocks, afterHostUpdate,
    'retired Image settings controls modified current canonical image data')

  const height = getControl('Height')
  height.value = '240px'
  height.dispatchEvent(new Event('change', { bubbles: true }))
  equal(editor.save().blocks[0].data.styles.height, '240px',
    'current Image settings input lost its live change handler')
  const expanded = getControl('Expanded')
  expanded.checked = false
  expanded.dispatchEvent(new Event('change', { bubbles: true }))
  equal(editor.save().blocks[0].data.expanded, false,
    'current Image settings toggle lost its live change handler')
  equal(editor.undo(), true)
  equal(editor.save().blocks[0].data.expanded, true)
})


test('Gallery retired settings controls cannot mutate refreshed canonical data', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Gallery')
  const editor = pluginEditor(fixture)
  const root = () => blockElement(editor, 'a')
  const gapField = () => [...root().querySelectorAll('.oe-gallery__style-form label')]
    .find(label => label.querySelector('span')?.textContent === 'Gap')
    ?.querySelector('input')
  const oldGap = gapField()
  const oldLayout = root().querySelector('.oe-gallery__layout-btn[data-layout="2"]')
  assert(oldGap && oldLayout, 'Gallery settings are missing expected controls')

  editor.blocks.update('a', current => ({ data: {
    ...current.data,
    layout: 'auto',
    images: current.data.images.map(image => image.id === 'second'
      ? { ...image, caption: 'Updated sibling' } : image),
    styles: { ...current.data.styles, gap: '12px' },
  } }))
  const afterHostUpdate = editor.save().blocks
  equal(gapField()?.value, '12px')
  assert(gapField() !== oldGap, 'Gallery full projection did not retire its previous settings')
  oldGap.value = '999px'
  oldGap.dispatchEvent(new Event('change', { bubbles: true }))
  oldLayout.click()
  equal(editor.save().blocks, afterHostUpdate,
    'retired Gallery controls modified the current authoring model')

  const currentGap = gapField()
  currentGap.value = '18px'
  currentGap.dispatchEvent(new Event('change', { bubbles: true }))
  equal(editor.save().blocks[0].data.styles.gap, '18px')
  const currentLayout = root().querySelector('.oe-gallery__layout-btn[data-layout="2"]')
  assert(currentLayout && currentLayout !== oldLayout)
  currentLayout.click()
  equal(editor.save().blocks[0].data.layout, '2')
  equal(editor.undo(), true)
  equal(editor.save().blocks[0].data.layout, afterHostUpdate[0].data.layout)
})


test('Checklist Enter on visually empty markup exits to default block and Undo restores it', async () => {
  const definition = createChecklistPlugin()
  const editor = make([{
    id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: { items: [{ id: 'only', text: '<strong></strong>', checked: false }] },
  }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'item:only', offset: 'start' })
  await dispatchKey('Enter', 'Enter', 13)
  equal(editor.save().blocks.length, 1)
  equal(editor.save().blocks[0].type, 'paragraph',
    'Checklist treated markup-only text as content and split instead of exiting')
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
})

test('List Enter on trailing visually empty markup inserts a new paragraph in one history action', async () => {
  const definition = createListPlugin()
  const editor = make([{
    id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: { style: 'ordered', items: [
      { id: 'first', text: 'Alpha' },
      { id: 'last', text: '<br>' },
    ] },
  }], { plugins: [createParagraphPlugin(), definition] })
  const before = editor.save().blocks
  editor.blocks.focus('a', { fieldKey: 'item:last', offset: 'start' })
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after.map(block => block.type), ['list', 'paragraph'])
  equal(after[0].data.items, [{ id: 'first', text: 'Alpha' }])
  equal(editor.undo(), true)
  equal(editor.save().blocks, before)
  equal(editor.redo(), true)
  equal(editor.save().blocks, after)
})


test('destroyed block and inline toolbar buttons do not consume late browser events', () => {
  const editor = make([para('a', 'Alpha')], { plugins: [createParagraphPlugin()] })
  const root = editorRoot(editor)
  const blockButton = root.querySelector('.oe-toolbar__btn:not(.oe-toolbar__drag)')
  const settingsButton = root.querySelector('.oe-toolbar__drag')
  const inlineTypeButton = root.querySelector('.oe-inline-toolbar__type-select')
  const inlineControlButton = root.querySelector('.oe-inline-toolbar__level-select')
  assert(blockButton && settingsButton && inlineTypeButton && inlineControlButton,
    'all toolbar controls must mount before the owner is destroyed')
  editor.destroy()
  for (const button of [blockButton, settingsButton, inlineTypeButton, inlineControlButton]) {
    const mousedown = new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, button: 0,
    })
    button.dispatchEvent(mousedown)
    assert(!mousedown.defaultPrevented,
      'retired toolbar mousedown consumed native browser input')
    const click = new MouseEvent('click', {
      bubbles: true, cancelable: true,
    })
    button.dispatchEvent(click)
    assert(!click.defaultPrevented && !click.cancelBubble,
      'retired toolbar button stole a later click from its host')
  }
  const arrow = new KeyboardEvent('keydown', {
    key: 'ArrowDown', bubbles: true, cancelable: true,
  })
  inlineControlButton.dispatchEvent(arrow)
  assert(!arrow.defaultPrevented && !arrow.cancelBubble,
    'retired inline dropdown intercepted a native ArrowDown key')
})


await run()
