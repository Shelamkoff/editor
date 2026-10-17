import { test, make, para, editorRoot, blockElement, editableField, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'
import { createParagraphPlugin, createPollPlugin, createPersonPlugin, createCodePlugin, createTablePlugin, createListPlugin, createColumnsPlugin, createTogglePlugin, createHeadingPlugin } from '../../plugins/index.js'
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
    data: { ...current.data, images: current.data.images.map(image => image.id === 'second'
      ? { ...image, caption: 'Updated image' } : image) },
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
          : name === 'LinkPreview' ? field.key === 'url' : field.key.endsWith(':caption'))
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


test('Gallery regenerated view clears an interrupted image drag', async () => {
  const fixture = pluginParityFixtures.find(item => item.name === 'Gallery')
  const editor = pluginEditor(fixture)
  const root = blockElement(editor, 'a').querySelector('.oe-gallery')
  const source = root.querySelector('.oe-gallery__slot[data-image-id="first"]')
  assert(source, 'Gallery source slot is missing')
  const dragstart = new Event('dragstart', { bubbles: true, cancelable: true })
  Object.defineProperty(dragstart, 'dataTransfer', {
    value: { setData() {}, effectAllowed: '' },
  })
  source.dispatchEvent(dragstart)
  editor.blocks.update('a', current => ({
    data: { ...current.data, images: current.data.images.map(image =>
      image.id === 'second' ? { ...image, caption: 'Updated second' } : image) },
  }))
  const over = new Event('dragover', { bubbles: true, cancelable: true })
  const transfer = { types: ['Files'], dropEffect: 'none' }
  Object.defineProperty(over, 'dataTransfer', { value: transfer })
  root.dispatchEvent(over)
  assert(over.defaultPrevented, 'old image drag prevented a fresh file drop after Gallery projection')
  equal(transfer.dropEffect, 'copy')
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

await run()
