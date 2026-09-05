import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Image } from '../../../plugins/image/index.js'
import { test, make, para, assert, equal, pause, select } from './harness.js'

export function register() {
  for (const replacement of ['render', 'clear', 'undo']) {
    test(`pending built-in image upload cannot mutate the document after ${replacement}`, async () => {
      let finish, signal
      const upload = new Promise(resolve => { finish = resolve })
      const editor = make(undefined, { plugins: [new Paragraph(), new Image({ uploadFile: (_file, context) => {
        signal = context.signal
        return upload
      } })] })
      if (replacement === 'undo') editor.blocks.insert('paragraph', { text: 'B' })
      const p = editor.blocks.getBlockByIndex(0).contentElement
      select(p, 1)
      const data = new DataTransfer()
      data.items.add(new File(['png'], 'x.png', { type: 'image/png' }))
      p.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
      await pause(10)
      assert(signal, 'upload must have started before replacement')
      if (replacement === 'render') editor.render({ version: '1', blocks: [para('new', 'New document')] })
      else editor[replacement]()
      const before = editor.save().blocks
      finish({ url: 'https://example.invalid/upload.png' })
      await pause(30)
      equal(editor.save().blocks, before)
      equal(signal.aborted, true, 'replacement cancels obsolete transport work')
    })
  }
  test('a pending upload still completes when an unrelated block is inserted', async () => {
    let finish
    const upload = new Promise(resolve => { finish = resolve })
    const editor = make(undefined, { plugins: [new Paragraph(), new Image({ uploadFile: () => upload })] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 1)
    const data = new DataTransfer()
    data.items.add(new File(['png'], 'x.png', { type: 'image/png' }))
    p.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    await pause(10)
    editor.blocks.insert('paragraph', { text: 'B' })
    finish({ url: 'https://example.invalid/upload.png' })
    await pause(30)
    equal(editor.save().blocks.map(block => block.type), ['paragraph', 'image', 'paragraph'])
  })
}
