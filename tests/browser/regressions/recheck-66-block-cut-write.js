import { test, make, para, equal, assert, expectError } from './harness.js'

export function register() {
  for (const mode of ['drop', 'alter', 'throw', 'success']) {
    test(`whole-block Cut preserves opaque data when mandatory write outcome is ${mode}`, () => {
      const editor = make([{ id: 'opaque', type: 'missing', data: { title: 'KEEP', payload: { n: 42 } } }, para('after', 'After')])
      const before = editor.save().blocks
      editor.blocks.selectBlocks(['opaque'])
      const data = new DataTransfer()
      const write = data.setData.bind(data)
      let attempted = false
      data.setData = (type, value) => {
        if (type !== 'application/x-rector-editor') return write(type, value)
        attempted = true
        if (mode === 'throw') throw new Error('intentional block clipboard failure')
        if (mode !== 'drop') write(type, mode === 'alter' ? '[]' : value)
      }
      if (mode === 'throw') expectError(/intentional block clipboard failure/)
      const event = new ClipboardEvent('cut', { clipboardData: data, bubbles: true, cancelable: true })
      editor.blocks.getBlockById('opaque').contentElement.dispatchEvent(event)
      assert(attempted, 'the real write path must run')
      assert(event.defaultPrevented, 'native deletion must not run after interception')
      if (mode === 'success') {
        equal(JSON.parse(data.getData('application/x-rector-editor')), [before[0]])
        equal(editor.save().blocks, [before[1]])
        editor.undo(); equal(editor.save().blocks, before)
        editor.redo(); equal(editor.save().blocks, [before[1]])
      } else {
        equal(editor.save().blocks, before)
        equal(editor.canUndo, false)
        equal(editor.blocks.getSelectedBlocks().map(block => block.id), ['opaque'])
      }
    })
  }
}
