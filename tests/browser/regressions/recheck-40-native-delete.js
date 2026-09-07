import { Paragraph, Quote } from '../../../plugins/index.js'
import { test, make, para, key, equal, assert, pause } from './harness.js'

function selectRange(first, start, last, end) {
  first.focus()
  const range = document.createRange(); range.setStart(first.firstChild || first, start); range.setEnd(last.firstChild || last, end)
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
}
export function register() {
  for (const direction of ['Backward', 'Forward']) {
    for (const input of ['keydown', 'beforeinput']) {
      test(`${input}: native cross-block deletion ${direction} replaces the entire range once`, async () => {
        const editor = make([para('a', 'Alpha'), para('middle', 'Middle'), para('b', 'Bravo')])
        const first = editor.blocks.getBlockById('a').contentElement
        selectRange(first, 2, editor.blocks.getBlockById('b').contentElement, 3)
        const event = input === 'keydown'
          ? key(first, direction === 'Backward' ? 'Backspace' : 'Delete')
          : new InputEvent('beforeinput', { inputType: `deleteContent${direction}`, bubbles: true, cancelable: true })
        if (input === 'beforeinput') first.dispatchEvent(event)
        equal(event.defaultPrevented, true)
        equal(editor.save().blocks.map(b => b.data.text), ['Alvo'])
        await pause()
        equal(editor.rootElement.querySelectorAll('.oe-block').length, 1)
        editor.undo(); equal(editor.save().blocks.map(b => b.data.text), ['Alpha', 'Middle', 'Bravo'])
        equal(editor.canUndo, false)
        editor.redo(); equal(editor.save().blocks.map(b => b.data.text), ['Alvo'])
      })
    }
  }
  test('native deletion retains unselected quote fields after the endpoint', () => {
    const editor = make([para('a', 'Alpha'), { id: 'q', type: 'quote', data: { text: 'Quote', caption: 'KEEP' } }], { plugins: [new Paragraph(), new Quote()] })
    const first = editor.blocks.getBlockById('a').contentElement
    selectRange(first, 2, editor.blocks.getBlockById('q').contentElement.querySelector('blockquote'), 2)
    key(first, 'Delete')
    equal(editor.save().blocks.map(b => b.data), [{ text: 'Alote' }, { text: '', caption: 'KEEP' }])
  })
  test('single-field and composing deletion remain native', () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editor.blocks.getBlockById('a').contentElement
    selectRange(first, 1, first, 3)
    equal(key(first, 'Backspace').defaultPrevented, false)
    selectRange(first, 2, editor.blocks.getBlockById('b').contentElement, 3)
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', isComposing: true, bubbles: true, cancelable: true })
    first.dispatchEvent(event); equal(event.defaultPrevented, false)
    equal(editor.save().blocks.map(b => b.data.text), ['Alpha', 'Bravo'])
  })
}
