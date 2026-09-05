import { test, make, para, equal, assert } from './harness.js'

export function register() {
  test('undo preserves the previous document version even when only the envelope changed', () => {
    const editor = make([para('a', 'A')])
    editor.render({ version: '2', blocks: [para('a', 'A')] })
    editor.blocks.insert('paragraph', { text: 'B' }, 1, 'b')
    assert(editor.undo())
    equal(editor.save().version, '2')
    equal(editor.save().blocks.map(block => block.data.text), ['A'])
    assert(editor.undo())
    equal(editor.save().version, '1')
    assert(editor.redo())
    equal(editor.save().version, '2')
  })
  test('capture time alone does not create an undo step', () => {
    const editor = make([para('a', 'A')])
    editor.render({ version: '1', time: 123, blocks: [para('a', 'A')] })
    equal(editor.canUndo, false)
    equal(editor.undo(), false)
  })
}
