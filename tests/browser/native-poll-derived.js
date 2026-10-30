import { test, assert, equal } from './regressions/harness.js'
import { printable, dispatchKey } from './native-input-helpers.js'
import { pollDerivedFixture, checkPollDerivedLabel, optionText } from './poll-derived-fixture.js'

test('Poll derived result completes after trusted native option input and exact one Undo/Redo', async () => {
  const h = await pollDerivedFixture()
  try {
    const before = h.editor.save().blocks, field = h.field(), inputs = []
    assert(h.editor.blocks.focus('poll', { fieldKey: 'option:first', offset: 'end' }))
    field.addEventListener('input', event => inputs.push({ trusted: event.isTrusted, type: event.inputType }))
    await printable('X')
    const after = structuredClone(before); after[0].data.options[0].text += 'X'
    equal(h.editor.save().blocks, after)
    checkPollDerivedLabel(h, optionText + 'X')
    equal(inputs, [{ trusted: true, type: 'insertText' }])
    assert(h.field() === field && document.activeElement === field)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(h.editor.save().blocks, before); checkPollDerivedLabel(h)
    assert(!h.editor.canUndo && h.editor.canRedo)
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(h.editor.save().blocks, after); checkPollDerivedLabel(h, optionText + 'X')
    assert(h.editor.canUndo && !h.editor.canRedo)
    equal(h.transactions.length, 3)
  } finally { h.dispose() }
})
