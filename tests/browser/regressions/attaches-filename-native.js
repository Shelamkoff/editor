import { createAttachesPlugin } from '../../../plugins/attaches/index.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { clickNative, dispatchKey, printable } from '../native-input-helpers.js'
import { test, make, blockElement, assert, equal } from './harness.js'

function caret(field, offset) {
  const selection = field.ownerDocument.getSelection()
  equal(field.ownerDocument.activeElement, field, 'Filename editing lost its active field')
  assert(selection.isCollapsed && field.contains(selection.anchorNode), 'Filename editing lost its native caret')
  equal(getTextOffset(field, selection.anchorNode, selection.anchorOffset), offset)
}

for (const variant of ['a', 'b', 'f', 'g']) {
  test(`Attaches native filename whitespace ${variant} survives continuation, sibling update and history`, async () => {
    const original = [{ id: 'attachments', type: 'attaches', dataVersion: 2, data: {
      variant,
      files: [
        { id: 'first', url: '/report.pdf', name: 'Report', extension: 'pdf', size: 20 },
        { id: 'second', url: '/sibling.txt', name: 'Sibling.txt', extension: 'txt', size: 10 },
      ],
    } }]
    const editor = make(original, { plugins: [createAttachesPlugin()], injectStyles: true })
    const wrapper = () => blockElement(editor, 'attachments')
    if (variant === 'a') await clickNative(wrapper().querySelector('.oe-attaches__chevron'))
    const field = wrapper().querySelector('.oe-attaches__name')
    const inputEvents = []
    field.addEventListener('input', event => inputEvents.push({ trusted: event.isTrusted, data: event.data }))
    await clickNative(field)
    await dispatchKey('End', 'End', 35)
    caret(field, 6)

    const states = [structuredClone(original)]
    const capture = (pattern, siblingName = 'Sibling.txt') => {
      const name = field.textContent
      // Chromium may use NBSP at contenteditable edges. Observe that native
      // spelling without rewriting the DOM or normalizing the saved name.
      assert(pattern.test(name), `Native filename has unexpected characters: ${JSON.stringify(name)}`)
      const expected = structuredClone(original)
      expected[0].data.files[0].name = name
      expected[0].data.files[1].name = siblingName
      equal(editor.save().blocks, expected, 'Saved filename must exactly match the trusted native text')
      states.push(expected)
    }

    await dispatchKey(' ', 'Space', 32, 0, ' ')
    capture(/^Report[ \u00a0]$/)
    caret(field, 7)

    editor.blocks.update('attachments', current => ({ data: {
      ...current.data,
      files: current.data.files.map(file => file.id === 'second' ? { ...file, name: 'Updated sibling.txt' } : file),
    } }))
    equal(wrapper().querySelector('.oe-attaches__name'), field, 'Sibling update replaced the active filename host')
    capture(/^Report[ \u00a0]$/, 'Updated sibling.txt')
    caret(field, 7)

    await printable('Q')
    capture(/^Report[ \u00a0]Q$/, 'Updated sibling.txt')
    caret(field, 8)

    // Replay closes the current native typing group without a timer or a
    // new requirement about whether a browser Home key starts a new group.
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, states[2])
    caret(field, 7)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, states[3])
    caret(field, 8)

    await dispatchKey('Home', 'Home', 36)
    await dispatchKey(' ', 'Space', 32, 0, ' ')
    capture(/^[ \u00a0]Report[ \u00a0]Q$/, 'Updated sibling.txt')
    caret(field, 1)
    equal(inputEvents, [
      { trusted: true, data: ' ' }, { trusted: true, data: 'Q' }, { trusted: true, data: ' ' },
    ], 'The whitespace regression must exercise trusted browser input')

    const undoOffsets = [6, 7, 7, 0]
    for (let index = states.length - 2; index >= 0; index--) {
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, states[index], `Undo did not restore filename action ${index}`)
      const restored = wrapper().querySelector('.oe-attaches__name')
      equal(restored.textContent, states[index][0].data.files[0].name)
      caret(restored, undoOffsets[index])
    }
    equal(editor.canUndo, false)
    const redoOffsets = [0, 7, 7, 8, 1]
    for (let index = 1; index < states.length; index++) {
      await dispatchKey('z', 'KeyZ', 90, 2 | 8)
      equal(editor.save().blocks, states[index], `Redo did not restore filename action ${index}`)
      const restored = wrapper().querySelector('.oe-attaches__name')
      equal(restored.textContent, states[index][0].data.files[0].name)
      caret(restored, redoOffsets[index])
    }
    equal(editor.canRedo, false)
    equal(original[0].data.files.map(file => file.name), ['Report', 'Sibling.txt'], 'Native editing mutated caller data')
  })
}
