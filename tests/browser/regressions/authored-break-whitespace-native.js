import { test, make, para, editableField, assert, equal } from './harness.js'
import { createChecklistPlugin } from '../../../plugins/checklist/index.js'
import { findNodeAtOffset, getTextOffset } from '../../../shared/textOffset.js'
import { dispatchKey, printable, waitForStyles } from '../native-input-helpers.js'

const initial = '<b>A<br></b>tail'
const sequences = [
  ['one space', [' ']],
  ['successive spaces', [' ', ' ']],
  ['three spaces in one native insertion', ['   ']],
  ['spaces followed by author text', [' ', ' ', 'X']],
  ['native text with leading and trailing spaces', ['  X  ']],
]

async function type(values) {
  for (const text of values) {
    if (text.length === 1) await printable(text)
    else await window.__testInput('Input.insertText', { text })
  }
}

function caretOffset(field) {
  const native = getSelection()
  assert(document.activeElement === field && native.isCollapsed, 'The current field must own a collapsed caret')
  return getTextOffset(field, native.anchorNode, native.anchorOffset)
}

function characterWidth(field, offset) {
  const start = findNodeAtOffset(field, offset, 'start'), end = findNodeAtOffset(field, offset + 1, 'end')
  const range = document.createRange()
  range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset)
  return range.getBoundingClientRect().width
}

function visibleSpaces(field, text) {
  for (let index = 0; index < text.length; index++) {
    if (text[index] === ' ') assert(characterWidth(field, 2 + index) > 0, `Authored space ${index} became invisible`)
  }
}

function whitespaceText(value, mode) {
  // Preserving the break's mark changes native DOM whitespace affinity.
  // SPACE/NBSP may differ in collapsing CSS, but every authored space must
  // occupy width and the logical author text must remain identical.
  return mode === 'normal' || mode === 'nowrap' || mode === 'pre-line'
    ? value.replace(/\u00a0/g, ' ') : value
}

async function nativeOracle(mode, values) {
  const field = document.createElement('div'), events = []
  field.contentEditable = 'true'
  field.style.whiteSpace = mode
  field.innerHTML = initial
  document.body.appendChild(field)
  field.addEventListener('beforeinput', event => events.push({ trusted: event.isTrusted, type: event.inputType }))
  try {
    field.focus()
    const mark = field.querySelector('b')
    getSelection().setBaseAndExtent(mark, 2, mark, 2)
    await type(values)
    assert(events.length > 0 && events.every(event => event.trusted && event.type === 'insertText'),
      'The whitespace oracle must use actual browser text input')
    const length = values.join('').length
    equal(caretOffset(field), 2 + length)
    visibleSpaces(field, values.join(''))
    return field.textContent
  } finally { field.remove() }
}

function encodedText(value) {
  const span = document.createElement('span')
  span.textContent = value
  return span.innerHTML
}

async function check(kind, values, modeOverride) {
  const checklist = createChecklistPlugin()
  const editor = kind === 'Paragraph'
    ? make([para('a', initial)], { inlineTools: [], injectStyles: true })
    : make([{ id: 'a', type: checklist.type, dataVersion: checklist.schema.currentVersion,
      data: { items: [{ id: 'first', text: initial, checked: false }] } }],
      { plugins: [checklist], defaultBlock: checklist.type, inlineTools: [], injectStyles: true })
  await waitForStyles(document)
  const field = editableField(editor, 'a'), fieldKey = kind === 'Paragraph' ? 'text' : 'item:first'
  if (modeOverride) field.style.whiteSpace = modeOverride
  const mode = getComputedStyle(field).whiteSpace
  const oracle = await nativeOracle(mode, values)
  const before = editor.save().blocks, events = [], transactions = []
  editor.on('transaction:committed', event => transactions.push(event))
  field.addEventListener('beforeinput', event => events.push(event))
  assert(editor.blocks.focus('a', { fieldKey, offset: 2 }))
  await type(values)
  assert(events.length > 0 && events.every(event => event.isTrusted && event.inputType === 'insertText'))
  assert(events[0].defaultPrevented, 'The authored BR must use its controlled native owner')
  equal(editableField(editor, 'a'), field, 'Typing must preserve the current authoring field')
  equal(whitespaceText(field.textContent, mode), whitespaceText(oracle, mode),
    `Whitespace must follow native ${mode} behavior`)
  const length = values.join('').length
  equal(caretOffset(field), 2 + length)
  visibleSpaces(field, values.join(''))
  const after = editor.save().blocks
  const authored = kind === 'Paragraph' ? after[0].data.text : after[0].data.items[0].text
  const logicalHtml = whitespaceText(authored.replace(/&nbsp;/g, '\u00a0'), mode)
  equal(logicalHtml, `<b>A<br>${encodedText(values.join(''))}</b>tail`,
    'The break keeps its formatting while native whitespace remains visible')
  equal(transactions.length, values.length, 'Each native input has one canonical author transaction')

  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before, 'One Undo must restore the whole typing group')
  assert(!editor.canUndo && editor.canRedo)
  equal(caretOffset(editableField(editor, 'a')), 2)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after, 'One Redo must restore formatting and all author whitespace')
  assert(editor.canUndo && !editor.canRedo)
  equal(caretOffset(editableField(editor, 'a')), 2 + length)
}

for (const kind of ['Checklist', 'Paragraph']) {
  for (const [name, values] of sequences) {
    test(`authored break ${kind} ${name} follows native whitespace and atomic history`, () => check(kind, values))
  }
}

for (const [kind, mode] of [
  ['Paragraph', 'normal'], ['Paragraph', 'nowrap'], ['Paragraph', 'pre-line'],
  ['Checklist', 'pre'], ['Checklist', 'pre-wrap'], ['Checklist', 'break-spaces'],
]) {
  test(`authored break follows computed ${mode} in ${kind}`, () => check(kind, ['  '], mode))
}
