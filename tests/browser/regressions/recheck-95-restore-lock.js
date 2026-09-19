import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, para, assert, equal } from './harness.js'

export function register() {
  test('Undo and Redo reject public mutations from plugin reconstruction', () => {
    let observe = null
    class ProbeParagraph extends Paragraph {
      render(data, context) {
        observe?.()
        return super.render(data, context)
      }
    }
    const editor = make([para('a', 'first')], { plugins: [new ProbeParagraph()] })
    editor.blocks.insert('paragraph', { text: 'second' })
    let observed = 0
    observe = () => {
      observed++
      equal(editor.canUndo, false)
      equal(editor.canRedo, false)
      equal(editor.undo(), false)
      equal(editor.redo(), false)
      const calls = [
        () => editor.blocks.insert('paragraph', { text: 'must not appear' }),
        () => editor.blocks.getBlockByIndex(0).focus(),
        () => editor.clear(),
        () => editor.render({ version: '1', blocks: [] }),
        () => editor.setReadOnly(true),
        () => editor.focus(),
        () => editor.insertInlinePlugin('unused'),
        () => editor.destroy(),
      ]
      for (const call of calls) {
        let rejected = false
        try { call() } catch (error) { rejected = /restor|transaction/i.test(String(error)) }
        assert(rejected, 'public mutation escaped the checkpoint reconstruction lock')
      }
      equal(editor.isReady, true)
    }
    equal(editor.undo(), true)
    equal(editor.save().blocks.map(block => block.data.text), ['first'])
    equal(editor.redo(), true)
    equal(editor.save().blocks.map(block => block.data.text), ['first', 'second'])
    assert(observed >= 3, 'both Undo and Redo must reconstruct plugin DOM')
    observe = null
  })
}
