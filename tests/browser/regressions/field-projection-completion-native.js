import { createCompletionFixture } from './field-projection-completion-fixture.js'
import { test, assert, equal, pause } from './harness.js'
import { dispatchKey } from '../native-input-helpers.js'

const completed = h => h.state.completions.map(item => [item.name, item.key, item.text])

function placeCaret(h) {
  const field = h.panels.get('a').field(), widget = h.latest('a-front')
  field.focus()
  window.getSelection().setBaseAndExtent(widget.element.firstChild, 7, widget.element.firstChild, 7)
  return { field, widget }
}

for (const normalize of [true, false]) test(`field completion native ${normalize ? 'canonical no-op normalization' : 'sidecar commit and one Undo/Redo'} settles the exact affected field`, async () => {
  const h = createCompletionFixture({ publicEditor: true, native: normalize ? 'normalize' : 'change' })
  try {
    h.mount(); await pause(20)
    const { field, widget } = placeCaret(h), before = h.editor.save().blocks, note = h.latest('a-note'), observations = []
    const output = h.panels.get('a').derived.get('front'), notices = [], phases = []
    h.state.completions.length = 0
    output.textContent = 'pending native normalization'
    h.state.onCompletion = notice => notices.push({ name: notice.name, key: notice.key,
      label: h.editor.save().blocks[0].inline['a-front'].data.label, commits: h.state.transactions.length })
    field.addEventListener('input', event => observations.push({ trusted: event.isTrusted, type: event.inputType, text: field.textContent }), { once: true })
    await dispatchKey('Backspace', 'Backspace', 8)
    assert(observations.length === 1 && observations[0].trusted && observations[0].type === 'deleteContentBackward', 'A genuine browser deletion must reach the native input owner')
    equal(observations[0].text, 'Front a-fron', 'The browser must actually change the widget before reconciliation')
    equal(h.state.nativeEdits.map(input => input.text), ['a-fron'], 'Native reconciliation did not receive the actual changed label')
    const after = structuredClone(before)
    if (!normalize) after[0].inline['a-front'].data.label = 'a-fron'
    equal(h.editor.save().blocks, after)
    equal(field.textContent, normalize ? 'Front a-front' : 'Front a-fron')
    assert(h.latest('a-front') === widget && h.latest('a-note') === note, 'Native finalization replaced an unaffected or surviving widget')
    equal(h.state.transactions.length, normalize ? 0 : 1)
    equal(h.editor.canUndo, !normalize)
    phases.push({ callbacks: completed(h), notices: [...notices], auxiliary: output.textContent })
    if (!normalize) {
      h.state.completions.length = 0; notices.length = 0
      assert(h.editor.undo())
      equal(h.editor.save().blocks, before); assert(!h.editor.canUndo && h.editor.canRedo)
      phases.push({ callbacks: completed(h), notices: [...notices], auxiliary: output.textContent })
      h.state.completions.length = 0; notices.length = 0
      assert(h.editor.redo())
      equal(h.editor.save().blocks, after); assert(h.editor.canUndo && !h.editor.canRedo)
      phases.push({ callbacks: completed(h), notices: [...notices], auxiliary: output.textContent })
      equal(h.state.transactions.map(event => event.action), ['commit', 'undo', 'redo'])
    }
    const label = normalize ? 'a-front' : 'a-fron'
    const expected = [{ callbacks: [['a', 'front', 'Front ' + label]],
      notices: [{ name: 'a', key: 'front', label: 'a-front', commits: 0 }], auxiliary: 'Front ' + label }]
    if (!normalize) expected.push(
      { callbacks: [['a', 'front', 'Front a-front']], notices: [{ name: 'a', key: 'front', label: 'a-fron', commits: 1 }], auxiliary: 'Front a-front' },
      { callbacks: [['a', 'front', 'Front a-fron']], notices: [{ name: 'a', key: 'front', label: 'a-front', commits: 2 }], auxiliary: 'Front a-fron' },
    )
    equal(phases, expected, 'Native completion must settle before acceptance, including no-transaction normalization')
  } finally { h.dispose() }
})

test('field completion native cancelled beforeinput does not acquire a completion or history action', async () => {
  const h = createCompletionFixture({ publicEditor: true, native: 'normalize' })
  try {
    h.mount(); await pause(20)
    const { field } = placeCaret(h), before = h.editor.save().blocks, root = h.holder.querySelector('.oe-editor')
    let prevented = false, inputs = 0
    root.addEventListener('beforeinput', event => { prevented = event.isTrusted; event.preventDefault() }, { once: true })
    field.addEventListener('input', () => { inputs++ })
    h.state.completions.length = 0
    await dispatchKey('Backspace', 'Backspace', 8)
    assert(prevented, 'The control must cancel a genuine native beforeinput')
    equal(inputs, 0); equal(h.state.nativeEdits, []); equal(h.state.completions, [])
    equal(h.editor.save().blocks, before); equal(h.state.transactions, [])
    equal(field.textContent, 'Front a-front'); assert(!h.editor.canUndo)
  } finally { h.dispose() }
})

for (const normalize of [false, true]) test(`field completion native ${normalize ? 'canonical no-op with undefined' : 'changed commit with Error'} failure recovers its accepted projection once`, async () => {
  const h = createCompletionFixture({ publicEditor: true, native: normalize ? 'normalize' : 'change' })
  const fault = normalize ? undefined : new Error('controlled native completion failure')
  try {
    h.mount(); await pause(20)
    const { field, widget } = placeCaret(h), before = h.editor.save().blocks, attempts = []
    let armed = true, failures = 0, trusted = false
    field.addEventListener('input', event => { trusted = event.isTrusted }, { once: true })
    h.state.onCompletion = notice => {
      if (notice.name !== 'a' || notice.key !== 'front') return
      attempts.push(notice)
      if (armed) { armed = false; failures++; throw fault }
    }
    await dispatchKey('Backspace', 'Backspace', 8)
    assert(trusted && h.state.nativeEdits.length === 1 && h.state.nativeEdits[0].text === 'a-fron', 'The recovery control requires an actual opted-in browser deletion')
    equal(failures, 1, 'The native finalization must deliver the controlled callback failure')
    equal(h.editor.save().blocks, before, 'Failed native completion changed accepted canonical content')
    equal(h.state.transactions, []); assert(!h.editor.canUndo && !h.editor.canRedo && !h.editor.readOnly && h.editor.isReady)
    const recovered = h.latest('a-front'), panel = h.panels.get('a')
    assert(recovered !== widget && widget.context.signal.aborted && !recovered.context.signal.aborted, 'Native recovery must retire the failed occurrence and acquire a coherent successor')
    equal(panel.field().textContent, 'Front a-front'); equal(panel.derived.get('front').textContent, 'Front a-front')
    equal(recovered.context.getData(), { label: 'a-front' }, 'The recovered context must remain readable under the runtime health guard')
    const task = recovered.context.beginTask(); task.cancel()
    equal(attempts.length, 2, 'Exactly one failed attempt and one coherent recovery must complete this field')
    assert(attempts[0].occurrence !== attempts[1].occurrence && attempts[0].element === field && attempts[1].element === panel.field())
    const native = window.getSelection()
    assert(native.anchorNode === recovered.element.firstChild && native.focusNode === recovered.element.firstChild)
    equal([native.anchorOffset, native.focusOffset], [7, 7])
    equal(h.state.diagnostics.filter(item => item.operation === 'inline-widget.immediate').length, 1)
    const count = h.state.completions.length
    for (let index = 0; index < 3; index++) h.editor.blocks.focus('a', { fieldKey: 'front', offset: 'end' })
    await pause(30)
    equal(h.state.completions.length, count); equal(failures, 1); equal(h.state.transactions, [])
    // A public mutation and exact one-step replay verify operational health;
    // IEditor intentionally exposes no private runtime health property.
    h.editor.blocks.update('b', current => ({ data: { ...current.data, front: 'Healthy {{b-front}}' } }))
    equal(h.state.transactions.length, 1); assert(h.editor.canUndo)
    assert(h.editor.undo()); equal(h.editor.save().blocks, before); assert(!h.editor.canUndo)
  } finally { h.dispose() }
})

test('field completion native removal completes the remaining author field before retiring the removed occurrence', async () => {
  const h = createCompletionFixture({ publicEditor: true, native: 'remove' })
  h.records[0].data.front = 'L{{a-front}}R'
  h.records[0].inline['a-front'].data.label = 'X'
  try {
    h.mount(); await pause(20)
    const before = h.editor.save().blocks, field = h.panels.get('a').field(), widget = h.latest('a-front')
    let trusted = false
    field.addEventListener('input', event => { trusted = event.isTrusted }, { once: true })
    field.focus(); window.getSelection().setBaseAndExtent(widget.element.firstChild, 1, widget.element.firstChild, 1)
    h.state.completions.length = 0
    await dispatchKey('Backspace', 'Backspace', 8)
    assert(trusted, 'The control requires an actual browser removal')
    const expected = structuredClone(before)
    expected[0].data.front = 'LR'
    delete expected[0].inline['a-front']
    equal(h.editor.save().blocks, expected, 'Completion rejected the native owner\'s pending removed occurrence')
    equal(completed(h), [['a', 'front', 'LR']])
    equal(h.panels.get('a').derived.get('front').textContent, 'LR')
    assert(widget.context.signal.aborted)
    equal(h.state.transactions.length, 1)
    assert(h.editor.undo()); equal(h.editor.save().blocks, before); assert(!h.editor.canUndo)
    equal(h.panels.get('a').derived.get('front').textContent, 'LXR')
    assert(h.editor.redo()); equal(h.editor.save().blocks, expected)
    equal(h.panels.get('a').derived.get('front').textContent, 'LR')
  } finally { h.dispose() }
})
