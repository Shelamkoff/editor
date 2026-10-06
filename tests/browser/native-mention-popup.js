import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { test, make, blockElement, editorRoot, assert, equal, pause, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'

async function suggestions() {
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '' } }], { injectStyles: true, inlinePlugins: [createMentionPlugin({
    debounceDelay: 0, searchFunction: async () => [{ id: 42, name: 'Ada' }, ...Array.from({ length: 19 }, (_, i) => ({ id: i + 1, name: 'Result ' + (i + 1) }))],
  })] })
  await clickNative(blockElement(editor, 'a').querySelector('.oe-paragraph'))
  await printable('@'); await printable('A'); await pause(100)
  assert(editorRoot(editor).querySelectorAll('.oe-mention-item[role="option"]').length === 20, 'Mention candidates did not load')
  return editor
}
test('Mention listbox fits its owned popup and the short viewport with a native choice', async () => {
  await window.__testInput('Viewport.set', { width: 390, height: 180 })
  try {
    const editor = await suggestions(), root = editorRoot(editor)
    const host = root.querySelector('.oe-ip-popup').getBoundingClientRect(), box = root.querySelector('.oe-mention-dropdown').getBoundingClientRect()
    assert(host.width >= 260 && host.height > 20, 'Mention contents escaped their measurable popup host: ' + JSON.stringify(host.toJSON()))
    assert(box.left >= 8 && box.right <= innerWidth - 8 && box.top >= 8 && box.bottom <= innerHeight - 8, 'Mention menu escaped the viewport: ' + JSON.stringify(box.toJSON()))
    const before = editor.save().blocks
    await dispatchKey('Enter', 'Enter', 13)
    const after = editor.save().blocks
    equal(Object.values(after[0].inline)[0].data, { id: '42', name: 'Ada' })
    await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
    await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
  } finally { await window.__testInput('Viewport.reset') }
})
test('Mention arrow navigation keeps the active last and first candidates visible', async () => {
  await window.__testInput('Viewport.set', { width: 390, height: 180 })
  try {
    const editor = await suggestions(), root = editorRoot(editor), before = editor.save().blocks
    const visibleActive = () => {
      const active = root.querySelector('.oe-mention-item--active'), menu = root.querySelector('.oe-mention-dropdown')
      assert(active && menu)
      const bounds = active.getBoundingClientRect(), clip = menu.getBoundingClientRect()
      assert(bounds.top >= clip.top && bounds.bottom <= clip.bottom && bounds.top >= 8 && bounds.bottom <= innerHeight - 8, 'Keyboard-active mention is outside the visible listbox: ' + JSON.stringify(bounds.toJSON()))
      return active
    }
    await dispatchKey('ArrowUp', 'ArrowUp', 38)
    equal(visibleActive().dataset.index, '19')
    await dispatchKey('ArrowDown', 'ArrowDown', 40)
    equal(visibleActive().dataset.index, '0')
    equal(editor.save().blocks, before)
    await dispatchKey('Enter', 'Enter', 13)
    equal(Object.values(editor.save().blocks[0].inline)[0].data, { id: '42', name: 'Ada' })
  } finally { await window.__testInput('Viewport.reset') }
})
await run()
