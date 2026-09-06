import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Image } from '../../../plugins/image/index.js'
import { selectAcross } from './cross-input-fixture.js'
import { test, make, para, select, input, pause, assert, equal } from './harness.js'

async function pendingImage(editor, element) {
  const data = new DataTransfer()
  data.items.add(new File(['png'], 'picture.png', { type: 'image/png' }))
  element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  await pause(15)
  assert(editor.rootElement.querySelector('.oe-pending-paste__indicator'), 'upload must be pending before changing its target')
}
function fixture() {
  let finish
  const upload = new Promise(resolve => { finish = resolve })
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie')], {
    plugins: [new Paragraph(), new Image({ uploadFile: () => upload })],
  })
  return { editor, async finish() { finish({ url: 'https://example.test/image.png' }); await pause(40) } }
}
const content = (editor, index) => editor.blocks.getBlockByIndex(index).contentElement

export function register() {
  for (const change of ['edit', 'same-id-replacement', 'remove', 'selection']) {
    test(`pending selected-block image paste is cancelled after target ${change}`, async () => {
      const { editor, finish } = fixture()
      const p = content(editor, 0)
      select(p, 2)
      editor.blocks.selectBlocks(['a', 'b'])
      await pendingImage(editor, p)
      if (change === 'edit') input(p, 'Alpha NEW TEXT')
      if (change === 'same-id-replacement') { editor.blocks.remove(0); editor.blocks.insert('paragraph', { text: 'New a' }, 0, 'a') }
      if (change === 'remove') editor.blocks.remove(0)
      if (change === 'selection') editor.blocks.selectBlocks(['c'])
      const before = editor.save().blocks
      await finish()
      equal(editor.save().blocks, before, 'a delayed replacement must not alter its stale target')
      equal(editor.rootElement.querySelectorAll('.oe-pending-pastes').length, 0)
    })
  }

  for (const change of ['endpoint-edit', 'middle-edit', 'insert-between', 'selection']) {
    test(`pending cross-range image paste is cancelled after ${change}`, async () => {
      const { editor, finish } = fixture()
      const p = content(editor, 0)
      await selectAcross(editor, p, 2, content(editor, 2), 3)
      await pendingImage(editor, p)
      if (change === 'endpoint-edit') input(content(editor, 2), 'Charlie NEW TEXT')
      if (change === 'middle-edit') input(content(editor, 1), 'Bravo NEW TEXT')
      if (change === 'insert-between') editor.blocks.insert('paragraph', { text: 'NEW BLOCK' }, 1, 'new')
      if (change === 'selection') document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      const before = editor.save().blocks
      await finish()
      equal(editor.save().blocks, before, 'range mutations must not be applied after the target changes')
    })
  }

  test('an unchanged selected-block target still replaces once and remains undoable', async () => {
    const { editor, finish } = fixture()
    const p = content(editor, 0)
    select(p, 2)
    editor.blocks.selectBlocks(['a', 'b'])
    await pendingImage(editor, p)
    await finish()
    equal(editor.save().blocks.map(block => block.type), ['image', 'paragraph'])
    equal(editor.save().blocks[1].data.text, 'Charlie')
    editor.undo()
    equal(editor.save().blocks.map(block => block.data.text), ['Alpha', 'Bravo', 'Charlie'])
    equal(editor.canUndo, false)
    editor.redo()
    equal(editor.save().blocks.map(block => block.type), ['image', 'paragraph'])
  })

  test('editing an unrelated block does not cancel a valid selected-block replacement', async () => {
    const { editor, finish } = fixture()
    const p = content(editor, 0)
    select(p, 2)
    editor.blocks.selectBlocks(['a', 'b'])
    await pendingImage(editor, p)
    input(content(editor, 2), 'Unrelated new text')
    await finish()
    equal(editor.save().blocks.map(block => block.type), ['image', 'paragraph'])
    equal(editor.save().blocks[1].data.text, 'Unrelated new text')
  })

  test('a non-replacing upload survives text entered into its nonempty anchor', async () => {
    const { editor, finish } = fixture()
    const p = content(editor, 0)
    select(p, 2)
    await pendingImage(editor, p)
    input(p, 'Alpha NEW TEXT')
    await finish()
    equal(editor.save().blocks.map(block => block.type), ['paragraph', 'image', 'paragraph', 'paragraph'])
    equal(editor.save().blocks[0].data.text, 'Alpha NEW TEXT')
  })

  test('a formerly empty anchor with a later whitespace edit is not replaced by an upload', async () => {
    const { editor, finish } = fixture()
    editor.render({ version: '1', blocks: [para('empty', '')] })
    const p = content(editor, 0)
    select(p, 0)
    await pendingImage(editor, p)
    input(p, ' ')
    await finish()
    equal(editor.save().blocks.map(block => block.data.text), [' '], 'even whitespace is a later author edit')
  })
}
