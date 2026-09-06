import { Paragraph, Quote } from '../../../plugins/index.js'
import { test, make, para, select, equal, assert, texts } from './harness.js'
import { selectAcross } from './cross-input-fixture.js'

function fixture(backwards = false, options = {}) {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], options)
  const target = selectAcross(editor, editor.blocks.getBlockByIndex(0).contentElement, 2,
    editor.blocks.getBlockByIndex(1).contentElement, 3, backwards)
  equal([...CSS.highlights.get('oe-cross-select')].map(range => range.toString()), ['phaBra'])
  return { editor, target }
}

function beforeInput(target, data, extra = {}) {
  const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data, ...extra })
  target.dispatchEvent(event)
  return event
}

export function register() {
  for (const backwards of [false, true]) {
    for (const [text, expected] of [['X', 'AlXvo'], ['😀', 'Al😀vo'], ['<b>X</b>', 'Al&lt;b&gt;X&lt;/b&gt;vo']]) {
      test(`text input ${JSON.stringify(text)} replaces the full ${backwards ? 'backward' : 'forward'} mouse selection`, () => {
        const { editor, target } = fixture(backwards)
        let changes = 0
        editor.events.on('editor:changed', () => changes++)
        assert(beforeInput(target, text).defaultPrevented)
        equal(texts(editor), [expected])
        equal(changes, 1, 'one successful replacement produces one change')
        assert(!editor.rootElement.classList.contains('oe-editor--cross-selecting'))
        editor.undo()
        equal(texts(editor), ['Alpha', 'Bravo'])
        equal(editor.canUndo, false)
        editor.redo()
        equal(texts(editor), [expected])
      })
    }
  }

  test('replacement text from input methods without keydown replaces the stored selection', () => {
    const { editor, target } = fixture()
    assert(beforeInput(target, 'word', { inputType: 'insertReplacementText' }).defaultPrevented)
    equal(texts(editor), ['Alwordvo'])
  })

  test('text replacement starts in the actual Quote caption and preserves its main field', () => {
    const editor = make([{ id: 'q', type: 'quote', data: { text: 'KEEP', caption: 'CAPTAIL' } }, para('b', 'Bravo')], {
      plugins: [new Paragraph(), new Quote()],
    })
    const caption = editor.blocks.getBlockByIndex(0).contentElement.querySelector('cite')
    const target = selectAcross(editor, caption, 3, editor.blocks.getBlockByIndex(1).contentElement, 3)
    beforeInput(target, 'X')
    equal(editor.save().blocks.map(block => block.data), [{ text: 'KEEP', caption: 'CAPXvo' }])
  })

  test('a native cross-block range receives the same atomic text replacement', () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const start = editor.blocks.getBlockByIndex(0).contentElement
    const end = editor.blocks.getBlockByIndex(1).contentElement
    start.focus()
    const range = document.createRange()
    range.setStart(start.firstChild, 2)
    range.setEnd(end.firstChild, 3)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    beforeInput(start, 'X')
    equal(texts(editor), ['AlXvo'])
  })

  test('single-host text input remains under native editing control', () => {
    const editor = make([para('a', 'Alpha')])
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 2, 4)
    equal(beforeInput(p, 'X').defaultPrevented, false)
    equal(texts(editor), ['Alpha'], 'synthetic beforeinput has no native default action')
  })

  test('retained cross selections do not intercept input in a plugin form', () => {
    const { editor } = fixture()
    const input = document.createElement('input')
    editor.blocks.getBlockByIndex(0).element.appendChild(input)
    equal(beforeInput(input, 'X').defaultPrevented, false)
    equal(texts(editor), ['Alpha', 'Bravo'])
  })

  test('composition and noncancelable input are not replaced as ordinary typed text', () => {
    const { editor, target } = fixture()
    equal(beforeInput(target, 'X', { isComposing: true }).defaultPrevented, false)
    equal(beforeInput(target, 'X', { cancelable: false }).defaultPrevented, false)
    equal(beforeInput(target, 'X', { inputType: 'insertCompositionText' }).defaultPrevented, false)
    equal(texts(editor), ['Alpha', 'Bravo'])
  })

  test('a failing input replacement restores the full selected document', () => {
    class Rejecting extends Paragraph {
      save(element) {
        if (element.textContent.includes('REJECT')) throw new Error('deliberate replacement failure')
        return super.save(element)
      }
    }
    const { editor, target } = fixture(false, { plugins: [new Rejecting()] })
    let changes = 0
    editor.events.on('editor:changed', () => changes++)
    beforeInput(target, 'REJECT')
    equal(texts(editor), ['Alpha', 'Bravo'])
    equal(changes, 0)
    equal(editor.canUndo, false)
  })
}
