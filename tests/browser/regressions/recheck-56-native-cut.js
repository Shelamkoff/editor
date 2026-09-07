import { Paragraph, Quote } from '../../../plugins/index.js'
import { test, make, para, select, assert, equal, expectError } from './harness.js'

export function crossRange(first, last, backwards = false) {
  first.focus()
  const selection = window.getSelection()
  const a = first.firstChild, b = last.firstChild
  selection.setBaseAndExtent(backwards ? b : a, backwards ? 3 : 2, backwards ? a : b, backwards ? 2 : 3)
  equal(selection.getRangeAt(0).toString(), 'phaBra')
}
function transfer(field, type, clipboardData = new DataTransfer()) {
  const event = new ClipboardEvent(type, { clipboardData, bubbles: true, cancelable: true })
  field.dispatchEvent(event)
  return { event, data: clipboardData }
}

export function register() {
  for (const backwards of [false, true]) {
    for (const action of ['copy', 'cut']) {
      test(`${action} honors the full ${backwards ? 'backward' : 'forward'} native Range`, () => {
        const editor = make([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Untouched')])
        const before = editor.save().blocks
        const first = editor.blocks.getBlockById('a').contentElement
        crossRange(first, editor.blocks.getBlockById('b').contentElement, backwards)
        const { event, data } = transfer(first, action)
        assert(event.defaultPrevented, 'the editor owns the cross-host operation')
        equal(data.getData('text/plain'), 'phaBra')
        const html = document.createElement('template'); html.innerHTML = data.getData('text/html')
        equal(html.content.textContent, 'phaBra', 'HTML and text represent the same range')
        if (action === 'copy') {
          equal(editor.save().blocks, before); equal(editor.canUndo, false)
        } else {
          equal(editor.save().blocks.map(block => block.data.text), ['Alvo', 'Untouched'])
          editor.undo(); equal(editor.save().blocks, before)
          equal(editor.canUndo, false, 'cut is one atomic history step')
          editor.redo(); equal(editor.save().blocks.map(block => block.data.text), ['Alvo', 'Untouched'])
        }
      })
    }
  }

  test('native cross-range Cut without a writable clipboard leaves content intact', () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editor.blocks.getBlockById('a').contentElement
    crossRange(first, editor.blocks.getBlockById('b').contentElement)
    const { event } = transfer(first, 'cut', null)
    assert(event.defaultPrevented, 'do not delegate destructive native deletion after write failure')
    equal(editor.save().blocks.map(block => block.data.text), ['Alpha', 'Bravo'])
    equal(editor.canUndo, false)
  })

  test('a clipboard write exception prevents the native cross-range Cut deletion', () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editor.blocks.getBlockById('a').contentElement
    crossRange(first, editor.blocks.getBlockById('b').contentElement)
    let attempts = 0
    const data = new DataTransfer()
    Object.defineProperty(data, 'setData', { value() { attempts++; throw new Error('deliberate clipboard write failure') } })
    expectError(/deliberate clipboard write failure/)
    assert(transfer(first, 'cut', data).event.defaultPrevented)
    equal(attempts, 1, 'the external write must actually fail')
    equal(editor.save().blocks.map(block => block.data.text), ['Alpha', 'Bravo'])
    equal(editor.canUndo, false)
  })

  test('native cross-range Cut preserves unselected Quote fields', () => {
    const editor = make([para('a', 'Alpha'), { id: 'b', type: 'quote', data: { text: 'Bravo', caption: 'KEEP' } }], { plugins: [new Paragraph(), new Quote()] })
    const first = editor.blocks.getBlockById('a').contentElement
    crossRange(first, editor.blocks.getBlockById('b').contentElement.querySelector('blockquote'))
    const { data } = transfer(first, 'cut')
    equal(data.getData('text/plain'), 'phaBra')
    equal(editor.save().blocks.map(block => block.data), [{ text: 'Alvo' }, { text: '', caption: 'KEEP' }])
  })

  test('explicit block selection takes precedence over a leftover native cross-range', () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editor.blocks.getBlockById('a').contentElement
    crossRange(first, editor.blocks.getBlockById('b').contentElement)
    editor.blocks.selectBlocks(['a', 'b'])
    const { data } = transfer(first, 'copy')
    equal(JSON.parse(data.getData('application/x-rector-editor')).map(block => block.data.text), ['Alpha', 'Bravo'])
    equal(editor.canUndo, false)
  })

  test('single-field Cut remains a native clipboard operation', () => {
    const editor = make([para('a', 'Alpha')])
    const first = editor.blocks.getBlockById('a').contentElement
    select(first, 2, 4)
    assert(!transfer(first, 'cut').event.defaultPrevented)
    equal(editor.save().blocks[0].data.text, 'Alpha', 'synthetic event does not emulate native deletion')
  })

  test('copy does not export a cross-editor Range as an owned block range', () => {
    const left = make([para('a', 'Alpha')]), right = make([para('b', 'Bravo')])
    const first = left.blocks.getBlockById('a').contentElement
    first.focus()
    const range = document.createRange()
    range.setStart(first.firstChild, 2)
    range.setEnd(right.blocks.getBlockById('b').contentElement.firstChild, 3)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    assert(!transfer(first, 'copy').event.defaultPrevented)
    equal(left.save().blocks[0].data.text, 'Alpha'); equal(right.save().blocks[0].data.text, 'Bravo')
  })
}
