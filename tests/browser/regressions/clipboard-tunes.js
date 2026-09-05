import { Quote } from '../../../plugins/quote/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, select, paste, assert, equal } from './harness.js'

export function register() {
  test('internal MIME preserves block tunes through paste, undo and redo', async () => {
    const editor = make(undefined, { plugins: [new Paragraph(), new Quote()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 1)
    await paste(p, { 'application/x-rector-editor': JSON.stringify([{
      id: 'producer-id', type: 'quote', revision: 'producer-revision',
      data: { text: 'Quoted', caption: 'Author' },
      tunes: { textAlign: 'right', custom: { flag: true } },
    }]) })
    const block = editor.save().blocks[1]
    equal(block.tunes, { textAlign: 'right', custom: { flag: true } })
    equal(editor.blocks.getBlockByIndex(1).contentElement.style.textAlign, 'right')
    assert(block.id !== 'producer-id', 'copies receive a new identity')
    equal(block.revision, undefined, 'producer revision must not describe a new copy')
    editor.undo()
    equal(editor.save().blocks.map(item => item.type), ['paragraph'])
    editor.redo()
    equal(editor.save().blocks[1].tunes, block.tunes)
  })
  test('internal MIME ignores malformed tunes instead of corrupting block metadata', async () => {
    const editor = make()
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 1)
    await paste(p, { 'application/x-rector-editor': JSON.stringify([
      { type: 'paragraph', data: { text: 'B' }, tunes: ['invalid'] },
    ]) })
    equal(editor.save().blocks[1].tunes, undefined)
    equal(editor.save().blocks[1].data.text, 'B')
  })
}
