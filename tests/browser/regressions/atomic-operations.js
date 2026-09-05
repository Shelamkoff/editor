import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, para, assert, equal, select, paste, texts } from './harness.js'

export function register() {
  test('split render failure preserves the extracted tail and the prior history', () => {
    let split
    class P extends Paragraph {
      render(data, context) {
        if (data.text === 'cdef') throw new Error('injected split failure')
        split = context.splitBlock
        return super.render(data)
      }
    }
    const editor = make([para('a', 'abcdef')], { plugins: [new P()] })
    select(editor.blocks.getBlockByIndex(0).contentElement, 2)
    let failed = false
    try { split() } catch { failed = true }
    assert(failed)
    equal(texts(editor), ['abcdef'])
    equal(editor.canUndo, false)
  })
  const broken = () => ({
    type: 'broken', title: 'Broken', icon: '',
    render() { throw new Error('injected paste failure') },
    save() { return {} },
  })
  const custom = JSON.stringify([
    { type: 'paragraph', data: { text: 'partial' } },
    { type: 'broken', data: {} },
  ])
  test('failed multi-block MIME paste rolls back before plain-text fallback', async () => {
    const editor = make(undefined, { plugins: [new Paragraph(), broken()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 1)
    await paste(p, { 'application/x-rector-editor': custom, 'text/plain': 'fallback' })
    equal(texts(editor), ['Afallback'])
    editor.undo()
    equal(texts(editor), ['A'])
    equal(editor.canUndo, false)
  })
  test('fallback replaces the original selection after rolling back MIME mutations', async () => {
    const editor = make([para('a', 'abcdef')], { plugins: [new Paragraph(), broken()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 2, 4)
    await paste(p, { 'application/x-rector-editor': custom, 'text/plain': 'X' })
    equal(texts(editor), ['abXef'])
    editor.undo()
    equal(texts(editor), ['abcdef'])
  })
  test('a failed MIME paste without fallback leaves the selected blocks unchanged', async () => {
    const editor = make([para('a', 'A'), para('b', 'B')], { plugins: [new Paragraph(), broken()] })
    editor.blocks.selectBlocks(['a', 'b'])
    await paste(editor.blocks.getBlockByIndex(0).contentElement, { 'application/x-rector-editor': custom })
    equal(texts(editor), ['A', 'B'])
    equal(editor.canUndo, false)
  })
}
