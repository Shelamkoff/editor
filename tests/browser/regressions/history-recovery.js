import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, para, input, equal, assert, texts } from './harness.js'

export function register() {
  for (const failure of ['validation', 'save']) {
    test(`Undo restores the latest valid checkpoint when live ${failure} fails`, () => {
      class FallibleParagraph extends Paragraph {
        save(element) {
          if (failure === 'save' && element.textContent === 'bad') throw new Error('Cannot save bad')
          return super.save(element)
        }
        validate(data) { return data.text !== 'bad' }
      }
      const editor = make([para('a', 'A')], { plugins: [new FallibleParagraph()], validationMode: 'strict' })
      editor.blocks.insert('paragraph', { text: 'B' }, 1, 'b')
      input(editor.blocks.getBlockByIndex(0).contentElement, 'bad')
      assert(editor.undo(), 'invalid edit should be discarded in one step')
      equal(texts(editor), ['A', 'B'])
      equal(editor.canRedo, false, 'an invalid state cannot be redone')
      assert(editor.undo())
      equal(texts(editor), ['A'])
      assert(editor.redo())
      equal(texts(editor), ['A', 'B'])
    })
  }
  test('recovering an invalid edit preserves an already valid redo branch', () => {
    class ValidatedParagraph extends Paragraph { validate(data) { return data.text !== 'bad' } }
    const editor = make([para('a', 'A')], { plugins: [new ValidatedParagraph()], validationMode: 'strict' })
    editor.blocks.insert('paragraph', { text: 'B' }, 1, 'b')
    editor.undo()
    input(editor.blocks.getBlockByIndex(0).contentElement, 'bad')
    assert(editor.undo())
    equal(texts(editor), ['A'])
    assert(editor.redo())
    equal(texts(editor), ['A', 'B'])
  })
}
