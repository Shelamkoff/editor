import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, equal, assert, texts, input, select } from './harness.js'

export function register() {
  function editorWithMutation() {
    let mutate
    class P extends Paragraph {
      render(data, context) { mutate = context.mutate; return super.render(data) }
    }
    const editor = make(undefined, { plugins: [new P()] })
    return { editor, mutate: operation => mutate(operation) }
  }
  test('failed nested mutation restores content without adding an undo state', () => {
    const { editor, mutate } = editorWithMutation()
    let failed = false
    try {
      mutate(() => { editor.blocks.insert('paragraph', { text: 'partial' }); throw new Error('injected') })
    } catch { failed = true }
    assert(failed)
    equal(texts(editor), ['A'])
    equal(editor.canUndo, false)
    equal(editor.undo(), false)
    equal(texts(editor), ['A'])
  })
  test('rollback preserves an existing redo branch', () => {
    const { editor, mutate } = editorWithMutation()
    editor.blocks.insert('paragraph', { text: 'B' })
    editor.undo()
    try { mutate(() => { editor.blocks.insert('paragraph', { text: 'partial' }); throw new Error('injected') }) } catch {}
    equal(editor.canRedo, true)
    equal(editor.redo(), true)
    equal(texts(editor), ['A', 'B'])
    equal(editor.undo(), true)
    equal(texts(editor), ['A'])
  })
  test('rollback restores the pre-command caret rather than focusing the end', () => {
    const { editor, mutate } = editorWithMutation()
    const p = editor.blocks.getBlockByIndex(0).contentElement
    input(p, 'abcdef')
    select(p, 2)
    try { mutate(() => { editor.blocks.insert('paragraph', { text: 'partial' }); throw new Error('injected') }) } catch {}
    const range = window.getSelection().getRangeAt(0)
    equal(range.startContainer.textContent, 'abcdef')
    equal(range.startOffset, 2)
    equal(texts(editor), ['abcdef'])
  })
  test('input inside a failed command does not leave pending history', () => {
    const { editor, mutate } = editorWithMutation()
    try { mutate(() => { input(editor.blocks.getBlockByIndex(0).contentElement, 'partial'); throw new Error('injected') }) } catch {}
    equal(texts(editor), ['A'])
    equal(editor.canUndo, false)
  })
}
