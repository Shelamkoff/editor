import { Paragraph, Quote } from '../../../plugins/index.js'
import { test, make, para, equal, assert, key, pause, expectError, texts } from './harness.js'
import { selectAcross } from './cross-input-fixture.js'

function fixture(stored = false, backwards = false) {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo'), para('safe', 'Safe')])
  const first = editor.blocks.getBlockById('a').contentElement
  const last = editor.blocks.getBlockById('b').contentElement
  if (stored) selectAcross(editor, first, 2, last, 3, backwards)
  else {
    first.focus()
    const r = document.createRange(); r.setStart(first.firstChild, 2); r.setEnd(last.firstChild, 3)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r)
  }
  return { editor, first }
}
function verify(editor) {
  equal(texts(editor), ['Al<br>vo', 'Safe'])
  editor.undo(); equal(texts(editor), ['Alpha', 'Bravo', 'Safe'])
  equal(editor.canUndo, false, 'replacement is one history operation')
  editor.redo(); equal(texts(editor), ['Al<br>vo', 'Safe'])
}
export function register() {
  for (const path of ['keyboard', 'beforeinput']) {
    for (const stored of [false, true]) {
      test(`soft break replaces the full ${stored ? 'mouse' : 'native'} range via ${path}`, () => {
        const { editor, first } = fixture(stored)
        const event = path === 'keyboard' ? key(first, 'Enter', { shiftKey: true })
          : new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true })
        if (path !== 'keyboard') first.dispatchEvent(event)
        assert(event.defaultPrevented)
        verify(editor)
      })
    }
  }
  test('soft break retains the unselected caption of the end block', () => {
    const editor = make([para('a', 'Alpha'), { id: 'q', type: 'quote', data: { text: 'Quote', caption: 'KEEP' } }], { plugins: [new Paragraph(), new Quote()] })
    const first = editor.blocks.getBlockById('a').contentElement
    first.focus()
    const r = document.createRange(); r.setStart(first.firstChild, 2); r.setEnd(editor.blocks.getBlockById('q').contentElement.querySelector('blockquote').firstChild, 2)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r)
    key(first, 'Enter', { shiftKey: true })
    equal(editor.save().blocks.map(b => b.data), [{ text: 'Al<br>ote' }, { text: '', caption: 'KEEP' }])
  })
  test('failed soft-break serialization rolls the whole range replacement back', () => {
    let rejected = 0
    class RejectBreak extends Paragraph {
      save(element) {
        const data = super.save(element)
        if (data.text.includes('<br>')) { rejected++; throw new Error('intentional soft-break save failure') }
        return data
      }
    }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new RejectBreak()] })
    const first = editor.blocks.getBlockById('a').contentElement, last = editor.blocks.getBlockById('b').contentElement
    selectAcross(editor, first, 2, last, 3)
    expectError(/Failed to save block a \(paragraph\)/)
    key(first, 'Enter', { shiftKey: true })
    assert(rejected > 0, 'the failing persistence phase must be reached')
    equal(texts(editor), ['Alpha', 'Bravo']); equal(editor.canUndo, false)
  })
}
export function registerNative() {
  for (const backwards of [false, true]) {
    test(`native Shift+Enter replaces ${backwards ? 'backward' : 'forward'} mouse range and retains caret`, async () => {
      const { editor } = fixture(true, backwards)
      const args = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 8, text: '\r' }
      await window.__testInput('Input.dispatchKeyEvent', { type: 'keyDown', ...args })
      await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...args })
      equal(texts(editor), ['Al<br>vo', 'Safe'])
      await window.__testInput('Input.insertText', { text: 'X' }); await pause()
      equal(texts(editor), ['Al<br>Xvo', 'Safe'])
      editor.undo(); equal(texts(editor), ['Al<br>vo', 'Safe'])
      editor.undo(); equal(texts(editor), ['Alpha', 'Bravo', 'Safe'])
    })
  }
}
