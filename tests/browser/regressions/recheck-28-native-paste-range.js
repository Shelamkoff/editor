import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Quote } from '../../../plugins/quote/index.js'
import { test, make, para, paste, assert, equal, texts } from './harness.js'

function rangeBetween(first, start, last, end) {
  first.focus()
  const range = document.createRange()
  range.setStart(first.firstChild || first, start)
  range.setEnd(last.firstChild || last, end)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}
function coherent(editor) {
  const handles = [...editor.blocks]
  const live = [...editor.rootElement.querySelectorAll('.oe-block[data-block-id]')]
  equal(live.map(node => node.dataset.blockId), handles.map(block => block.id), 'DOM and block model must have identical live blocks')
  for (const block of handles) assert(block.element.contains(block.contentElement), 'block content cannot be detached by Range deletion')
}

export function register() {
  for (const [name, data, expected] of [
    ['single-line text', { 'text/plain': 'X' }, ['AlXvo', 'Unselected']],
    ['single paragraph HTML', { 'text/html': '<p><b>X</b></p>' }, ['Al<b>X</b>vo', 'Unselected']],
    ['multiline text', { 'text/plain': 'X\nY' }, ['AlX', 'Yvo', 'Unselected']],
    ['multiple HTML paragraphs', { 'text/html': '<p>X</p><p>Y</p>' }, ['AlX', 'Yvo', 'Unselected']],
  ]) {
    test(`native cross-block selection: ${name} replaces the whole range without detached blocks`, async () => {
      const editor = make([para('a', 'Alpha'), para('m', 'Middle'), para('b', 'Bravo'), para('after', 'Unselected')])
      const start = editor.blocks.getBlockById('a').contentElement
      rangeBetween(start, 2, editor.blocks.getBlockById('b').contentElement, 3)
      await paste(start, data)
      equal(texts(editor), expected)
      coherent(editor)
      editor.undo()
      equal(texts(editor), ['Alpha', 'Middle', 'Bravo', 'Unselected'])
      equal(editor.canUndo, false)
      coherent(editor)
      editor.redo()
      equal(texts(editor), expected)
      coherent(editor)
    })
  }

  test('native cross-block paste preserves the unselected caption after the end field', async () => {
    const editor = make([para('a', 'Alpha'), { id: 'q', type: 'quote', data: { text: 'Quote', caption: 'KEEP' } }], {
      plugins: [new Paragraph(), new Quote()],
    })
    const start = editor.blocks.getBlockById('a').contentElement
    rangeBetween(start, 2, editor.blocks.getBlockById('q').contentElement.querySelector('blockquote'), 2)
    await paste(start, { 'text/plain': 'X' })
    equal(editor.save().blocks.map(block => block.data), [{ text: 'AlXote' }, { text: '', caption: 'KEEP' }])
    coherent(editor)
  })

  test('a paste whose selection ends outside its editor does not mutate either document', async () => {
    const editor = make([para('a', 'Alpha')])
    const other = make([para('b', 'Bravo')])
    const start = editor.blocks.getBlockById('a').contentElement
    rangeBetween(start, 2, other.blocks.getBlockById('b').contentElement, 3)
    await paste(start, { 'text/plain': 'X' })
    equal(texts(editor), ['Alpha'])
    equal(texts(other), ['Bravo'])
    coherent(editor); coherent(other)
    equal(editor.canUndo, false)
  })

  test('native cross-block paste rolls back the whole replacement if new text fails validation', async () => {
    class RejectX extends Paragraph { validate(data) { return !data.text.includes('X') } }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new RejectX()], validationMode: 'strict' })
    const start = editor.blocks.getBlockById('a').contentElement
    rangeBetween(start, 2, editor.blocks.getBlockById('b').contentElement, 3)
    await paste(start, { 'text/plain': 'X' })
    equal(texts(editor), ['Alpha', 'Bravo'])
    coherent(editor)
    equal(editor.canUndo, false)
  })
  test('a selection spanning two fields of one block cannot detach the field structure on paste', async () => {
    const editor = make([{ id: 'q', type: 'quote', data: { text: 'Quote', caption: 'Caption' } }], {
      plugins: [new Paragraph(), new Quote()],
    })
    const root = editor.blocks.getBlockById('q').contentElement
    rangeBetween(root.querySelector('blockquote'), 2, root.querySelector('cite'), 3)
    await paste(root.querySelector('blockquote'), { 'text/plain': 'X' })
    equal(editor.save().blocks[0].data, { text: 'Quote', caption: 'Caption' }, 'unsupported field-spanning replacement must refuse before modifying DOM')
    assert(root.querySelector('blockquote') && root.querySelector('cite'))
    equal(editor.canUndo, false)
  })

  test('failed custom MIME paste restores a native cross-block range before text fallback', async () => {
    class Fails extends Paragraph {
      type = 'failing'
      render() { throw new Error('deliberate MIME render failure') }
    }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new Paragraph(), new Fails()] })
    const start = editor.blocks.getBlockById('a').contentElement
    rangeBetween(start, 2, editor.blocks.getBlockById('b').contentElement, 3)
    await paste(start, {
      'application/x-rector-editor': JSON.stringify([{ type: 'failing', data: { text: 'Never committed' } }]),
      'text/plain': 'X',
    })
    equal(texts(editor), ['AlXvo'])
    coherent(editor)
    editor.undo()
    equal(texts(editor), ['Alpha', 'Bravo'])
  })

}
