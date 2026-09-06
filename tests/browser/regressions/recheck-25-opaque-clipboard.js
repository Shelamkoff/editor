import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Image } from '../../../plugins/image/index.js'
import { test, make, para, select, paste, assert, equal } from './harness.js'

const mime = 'application/x-rector-editor'
const opaque = {
  id: 'producer-id', type: 'missing-plugin', revision: 'producer-revision',
  data: { title: 'Opaque', payload: { number: 42, values: [false, null, 'data'] }, text: '{{widget}}' },
  inline: { widget: { type: 'missing-inline', data: { value: 'Kept' } } },
  tunes: { textAlign: 'right', custom: { keep: true } },
}
async function insert(editor, blocks, extra = {}) {
  const p = editor.blocks.getBlockByIndex(0).contentElement
  select(p, 1)
  await paste(p, { [mime]: JSON.stringify(blocks), ...extra })
}
export function register() {
  test('internal clipboard preserves an unregistered block as an opaque read-only block', async () => {
    const editor = make()
    await insert(editor, [opaque])
    const copy = editor.save().blocks[1]
    equal(copy.type, 'missing-plugin')
    equal(copy.data, opaque.data)
    equal(copy.inline, opaque.inline)
    equal(copy.tunes, opaque.tunes)
    assert(copy.id !== opaque.id, 'the copy has a new block identity')
    equal(copy.revision, undefined, 'a new copy cannot inherit a producer revision')
    assert(!editor.blocks.getBlockByIndex(1).contentElement.querySelector('[contenteditable="true"]'))
    const persisted = editor.save()
    editor.render(persisted)
    equal(editor.save().blocks, persisted.blocks)
  })

  test('copying Image to a limited editor keeps the image data instead of choosing a lossy HTML fallback', async () => {
    const source = make([{ id: 'photo', type: 'image', data: { file: { url: 'https://example.test/photo.png' }, caption: 'Photo' } }], {
      plugins: [new Paragraph(), new Image()],
    })
    source.blocks.selectBlocks(['photo'])
    const data = new DataTransfer()
    source.blocks.getBlockByIndex(0).contentElement.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }))
    const target = make()
    await insert(target, JSON.parse(data.getData(mime)), { 'text/html': data.getData('text/html'), 'text/plain': data.getData('text/plain') })
    const copy = target.save().blocks[1]
    equal(copy.type, 'image')
    equal(copy.data, source.save().blocks[0].data)
  })

  test('mixed known and unregistered clipboard blocks preserve order in one undo/redo step', async () => {
    const editor = make()
    await insert(editor, [para('known', 'B'), opaque, para('last', 'C')])
    const saved = editor.save().blocks
    equal(saved.map(block => block.type), ['paragraph', 'paragraph', 'missing-plugin', 'paragraph'])
    equal(saved[2].data, opaque.data)
    editor.undo()
    equal(editor.save().blocks.map(block => block.data.text), ['A'])
    equal(editor.canUndo, false)
    editor.redo()
    equal(editor.save().blocks, saved)
  })

  test('opaque clipboard data remains usable after the missing plugin is registered by the recipient', async () => {
    const target = make()
    await insert(target, [opaque])
    let received
    const plugin = {
      type: opaque.type, title: 'Restored', icon: '',
      render(data) { received = structuredClone(data); const node = document.createElement('div'); node.textContent = data.title; return node },
      save() { return structuredClone(received) },
    }
    const next = make(target.save().blocks, { plugins: [new Paragraph(), plugin] })
    equal(received, opaque.data)
    equal(next.save().blocks[1].data, opaque.data)
  })

  test('opaque clipboard copies remap duplicate block IDs without merging their payloads', async () => {
    const editor = make()
    await insert(editor, [opaque, { ...opaque, data: { title: 'Other data' } }])
    const copies = editor.save().blocks.slice(1)
    assert(copies[0].id !== copies[1].id)
    equal(copies.map(block => block.data), [opaque.data, { title: 'Other data' }])
  })

  test('public insert still rejects an unregistered plugin rather than enabling opaque import implicitly', () => {
    const editor = make()
    let error
    try { editor.blocks.insert(opaque.type, opaque.data) } catch (caught) { error = caught }
    assert(error instanceof Error)
    equal(editor.save().blocks.map(block => block.data.text), ['A'])
  })
}
