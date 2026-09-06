import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Quote } from '../../../plugins/quote/index.js'
import { test, make, para, key, pause, assert, equal, texts } from './harness.js'

function nativeRange(start, startOffset, end, endOffset) {
  start.focus()
  const range = document.createRange()
  range.setStart(start.firstChild ?? start, startOffset)
  range.setEnd(end.firstChild ?? end, endOffset)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

async function mouseRange(editor, start, startOffset, end, endOffset, backwards = false) {
  editor.rootElement.scrollIntoView()
  const point = (element, offset) => {
    const range = document.createRange()
    range.setStart(element.firstChild, offset - 1)
    range.setEnd(element.firstChild, offset)
    const rect = range.getBoundingClientRect()
    return { clientX: rect.right - 1, clientY: rect.top + rect.height / 2 }
  }
  const first = backwards ? end : start
  const last = backwards ? start : end
  first.focus()
  first.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, button: 0, buttons: 1,
    ...point(first, backwards ? endOffset : startOffset),
  }))
  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true, buttons: 1,
    ...point(last, backwards ? startOffset : endOffset),
  }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 }))
  await pause(20)
  assert(editor.rootElement.classList.contains('oe-editor--cross-selecting'), 'mouse selection fixture must activate')
  return first
}

export function register() {
  test('Enter replaces a native cross-block range as one undoable command', () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const a = editor.blocks.getBlockByIndex(0).contentElement
    const b = editor.blocks.getBlockByIndex(1).contentElement
    nativeRange(a, 2, b, 3)
    equal(key(a, 'Enter').defaultPrevented, true)
    equal(texts(editor), ['Al', 'vo'])
    editor.undo()
    equal(texts(editor), ['Alpha', 'Bravo'])
    equal(editor.canUndo, false, 'replacement must not create separate delete/split steps')
    editor.redo()
    equal(texts(editor), ['Al', 'vo'])
  })

  for (const backwards of [false, true]) {
    test(`Enter replaces a ${backwards ? 'backward' : 'forward'} mouse cross-block selection`, async () => {
      const editor = make([para('a', 'Alpha'), para('middle', 'Selected'), para('b', 'Bravo'), para('after', 'Untouched')])
      const a = editor.blocks.getBlockByIndex(0).contentElement
      const b = editor.blocks.getBlockByIndex(2).contentElement
      const target = await mouseRange(editor, a, 2, b, 3, backwards)
      key(target, 'Enter')
      equal(texts(editor), ['Al', 'vo', 'Untouched'])
      equal(editor.rootElement.classList.contains('oe-editor--cross-selecting'), false)
      editor.undo()
      equal(texts(editor), ['Alpha', 'Selected', 'Bravo', 'Untouched'])
    })
  }

  test('cross-block Enter from a quote caption does not move its earlier field', () => {
    const editor = make([
      { id: 'q', type: 'quote', data: { text: 'KEEP MAIN', caption: 'CAPTAIL' } },
      para('b', 'Bravo'),
    ], { plugins: [new Paragraph(), new Quote()] })
    const caption = editor.blocks.getBlockByIndex(0).contentElement.querySelector('cite')
    nativeRange(caption, 3, editor.blocks.getBlockByIndex(1).contentElement, 3)
    key(caption, 'Enter')
    equal(editor.save().blocks.map(block => block.data), [{ text: 'KEEP MAIN', caption: 'CAP' }, { text: 'vo' }])
    editor.undo()
    equal(editor.save().blocks.map(block => block.data), [{ text: 'KEEP MAIN', caption: 'CAPTAIL' }, { text: 'Bravo' }])
  })

  test('cross-block Enter retains fields following the selection endpoint', () => {
    const editor = make([
      para('a', 'Alpha'), { id: 'q', type: 'quote', data: { text: 'Quote', caption: 'Unselected' } },
    ], { plugins: [new Paragraph(), new Quote()] })
    const a = editor.blocks.getBlockByIndex(0).contentElement
    nativeRange(a, 2, editor.blocks.getBlockByIndex(1).contentElement.querySelector('blockquote'), 2)
    key(a, 'Enter')
    equal(editor.save().blocks.map(block => block.data), [{ text: 'Al' }, { text: 'ote' }, { text: '', caption: 'Unselected' }])
  })

  test('cross-block Enter rolls back the deletion if the new paragraph cannot render', () => {
    class FailingParagraph extends Paragraph {
      render(data) {
        if (data?.text === 'vo') throw new Error('deliberate split render failure')
        return super.render(data)
      }
    }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new FailingParagraph()] })
    const a = editor.blocks.getBlockByIndex(0).contentElement
    nativeRange(a, 2, editor.blocks.getBlockByIndex(1).contentElement, 3)
    key(a, 'Enter')
    equal(texts(editor), ['Alpha', 'Bravo'])
    equal(editor.canUndo, false)
  })

  test('Enter refuses a range extending outside the editor without inserting a block', () => {
    const editor = make([para('a', 'Alpha')])
    const outside = document.createElement('p')
    outside.textContent = 'External'
    document.body.appendChild(outside)
    try {
      const a = editor.blocks.getBlockByIndex(0).contentElement
      nativeRange(a, 2, outside, 3)
      key(a, 'Enter')
      equal(texts(editor), ['Alpha'])
      equal(outside.textContent, 'External')
      equal(editor.canUndo, false)
    } finally { outside.remove() }
  })
}
