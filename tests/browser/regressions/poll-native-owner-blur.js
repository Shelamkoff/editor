import { assert, equal, pause, test } from './harness.js'
import { clickNative, printable, dispatchKey } from '../native-input-helpers.js'
import { pollProviderFixture } from './poll-provider-ownership.js'

function focusEnd(field) {
  field.focus()
  const range = document.createRange()
  range.selectNodeContents(field); range.collapse(false)
  const selection = getSelection()
  selection.removeAllRanges(); selection.addRange(range)
}

function outsideButton() {
  const button = document.createElement('button')
  button.textContent = 'Outside Poll'
  document.body.append(button)
  return button
}

test('Poll native ownership: current option input and blur keep one Undo/Redo action', async () => {
  const h = await pollProviderFixture(), outside = outsideButton()
  try {
    const before = h.editor.save().blocks, input = []
    h.field.addEventListener('input', event => input.push({ trusted: event.isTrusted, type: event.inputType }))
    focusEnd(h.field)
    await printable('X')
    equal(input, [{ trusted: true, type: 'insertText' }])
    const after = structuredClone(before); after[0].data.options[0].text = '<b>AlphaX</b>'
    equal(h.editor.save().blocks, after)
    equal(h.wrapper.querySelector('.oe-poll__result-label').innerHTML, '<b>AlphaX</b>')
    await clickNative(outside)
    equal(h.editor.save().blocks, after)
    equal(h.transactions.length, 1, 'Blur added another authoring action')
    assert(h.editor.undo()); equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.editor.canRedo)
    assert(h.editor.redo()); equal(h.editor.save().blocks, after)
    equal(h.transactions.length, 3)
    equal(h.errors, [])
  } finally { h.editor.destroy(); outside.remove() }
})

for (const adopted of ['wrapper', 'shell']) {
  test(`Poll native ownership: native blur cannot submit an adopted whole ${adopted}`, async () => {
    const h = await pollProviderFixture(), foreign = document.createElement('aside'), outside = outsideButton()
    document.body.append(foreign)
    try {
      const before = h.editor.save().blocks, target = adopted === 'wrapper' ? h.wrapper : h.shell, inputs = []
      foreign.append(target)
      h.field.addEventListener('input', event => inputs.push({ trusted: event.isTrusted, type: event.inputType }))
      focusEnd(h.field)
      await printable('X')
      equal(inputs, [{ trusted: true, type: 'insertText' }])
      equal(h.field.textContent, 'AlphaX')
      const content = h.wrapper.innerHTML
      await clickNative(outside)
      await pause()
      equal(h.wrapper.innerHTML, content, 'Blur changed the adopted author view')
      assert(target.parentNode === foreign)
      equal(h.editor.save().blocks, before)
      equal({ events: h.transactions.length, undo: h.editor.canUndo, redo: h.editor.canRedo }, { events: 0, undo: false, redo: false })
      equal(h.errors, [])
    } finally { h.editor.destroy(); foreign.remove(); outside.remove() }
  })
}
