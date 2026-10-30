import { assert, equal, pause, test } from './harness.js'
import { clickNative, printable } from '../native-input-helpers.js'
import { pollProviderFixture, results } from './poll-provider-ownership.js'

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

test('Poll completed labels: provider refresh uses the last trusted native option completion', async () => {
  const h = await pollProviderFixture()
  try {
    const before = h.editor.save().blocks, input = []
    h.field.addEventListener('input', event => input.push({ trusted: event.isTrusted, type: event.inputType }))
    focusEnd(h.field)
    await printable('X')
    equal(input, [{ trusted: true, type: 'insertText' }])
    const after = structuredClone(before); after[0].data.options[0].text = '<b>AlphaX</b>'
    equal(h.editor.save().blocks, after)
    h.subscriptions[0].onUpdate(results('2', 8, 2))
    await pause()
    equal([...h.wrapper.querySelectorAll('.oe-poll__result-pct')].map(node => node.textContent), ['80%', '20%'])
    assert(h.wrapper.querySelector('.oe-poll__option-text[data-option-id="first"]') === h.field)
    equal(h.field.innerHTML, '<b>AlphaX</b>')
    equal(h.wrapper.querySelector('.oe-poll__result-label').innerHTML, '<b>AlphaX</b>')
    equal(h.editor.save().blocks, after)
    equal({ events: h.transactions.length, undo: h.editor.canUndo, redo: h.editor.canRedo }, { events: 1, undo: true, redo: false })
    equal(h.errors, [])
  } finally { h.editor.destroy() }
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

test('Poll native ownership: an outstanding vote cannot repaint an adopted shell or report twice', async () => {
  const h = await pollProviderFixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const before = h.editor.save().blocks
    await clickNative(h.wrapper.querySelector('.oe-poll__choice[data-option-id="first"]'))
    await clickNative(h.wrapper.querySelector('.oe-poll__submit'))
    equal(h.votes.length, 1)
    assert(!h.votes[0].signal.aborted)
    foreign.append(h.shell)
    const html = h.wrapper.innerHTML, children = [...h.wrapper.childNodes]
    h.votes[0].resolve(results('2', 8, 2))
    await pause(30)
    equal(h.wrapper.innerHTML, html); equal([...h.wrapper.childNodes], children)
    assert(h.shell.parentNode === foreign)
    equal(h.errors.length, 1, 'Vote settlement retried the rejected presentation')
    assert(h.votes[0].signal.aborted, 'Completed vote resources were not released')
    equal(h.editor.save().blocks, before); equal(h.transactions.length, 0)
    assert(!h.editor.canUndo && !h.editor.canRedo)
  } finally { h.editor.destroy(); foreign.remove() }
})
