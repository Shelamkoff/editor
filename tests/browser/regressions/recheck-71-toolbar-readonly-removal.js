import { test, make, assert, para, pause } from './harness.js'

export function register() {
  test('read-only transition does not resurrect toolbar after block removal animation', async () => {
    const editor = make([para('a', 'A'), para('b', 'B')], {
      tuning: {
        undo: { debounceMs: 10000 },
        change: { debounceMs: 10000 },
        animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 80 },
      },
    })
    const root = editor.rootElement
    assert(root.querySelector('.oe-toolbar'), 'editable editor should mount its toolbar')

    editor.blocks.remove(0)
    editor.setReadOnly(true)
    assert(!root.querySelector('.oe-toolbar'), 'read-only transition should unmount the toolbar immediately')

    await pause(120)
    assert(!root.querySelector('.oe-toolbar'), 'completed removal animation must not resurrect a destroyed toolbar')
  })
}
