import { createPresentationNativeFixture } from './presentation-fixture.js'
import { test, assert, equal, pause, make, para, editableField } from './harness.js'

const clone = value => structuredClone(value)
const range = () => {
  const selection = window.getSelection()
  return { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset, active: document.activeElement }
}
const sameRange = before => {
  const current = range()
  return Object.keys(before).every(key => current[key] === before[key])
}
async function compose(field) {
  const events = []
  field.addEventListener('compositionstart', event => events.push({ trusted: event.isTrusted }))
  field.focus(); window.getSelection().setBaseAndExtent(field.firstChild, 1, field.firstChild, 1)
  await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', windowsVirtualKeyCode: 229 })
  await window.__testInput('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Process', windowsVirtualKeyCode: 229 })
  await pause(20)
  assert(events.some(event => event.trusted) && field.textContent.includes('に'), 'Precondition: genuine uncommitted composition is required')
  return { range: range(), html: field.innerHTML, text: field.firstChild }
}
async function closeComposition(h) {
  h.dispose()
  await window.__testInput('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 })
}

for (const name of ['a', 'b']) test(`presentation failure preserves genuine ${name === 'a' ? 'same-block' : 'independent-block'} IME and its single native commit`, async () => {
  const h = createPresentationNativeFixture()
  try {
    await pause(20)
    const before = h.editor.save().blocks, note = h.panels.get(name).note, widget = h.latest(`${name}-note`), task = widget.context.beginTask()
    const pending = await compose(note)
    equal(h.editor.save().blocks, before)
    h.arm('create', 'a-back')
    h.panels.get('a').button('back').click()
    if (name === 'a') h.panels.get('b').button('back').click()
    await pause(40)
    assert(note.innerHTML === pending.html && note.firstChild === pending.text && sameRange(pending.range), 'Presentation discarded pending native DOM or exact range')
    assert(h.latest(`${name}-note`).element === widget.element && widget.element.isConnected && !widget.context.signal.aborted && !task.signal.aborted,
      'Presentation retired the unrelated native field occurrence')
    assert(h.panels.get('a').field().contentEditable === 'false' && h.panels.get('a').field().innerHTML === '', 'Failed field must remain non-authoring')
    if (name === 'a') assert(h.latest('b-back').element.isConnected && h.panels.get('b').field().querySelector('[data-oe-opaque-inline="b-opaque"]'), 'Independent B delivery did not hydrate known and opaque occurrences')
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.state.transactions.length === 0)
    equal(h.state.diagnostics.filter(item => item.operation === 'projection.presentation').length, 1)
    await window.__testInput('Input.insertText', { text: '日本' }); await pause(40)
    const expected = clone(before); expected.find(block => block.id === name).data.note = `N日本ote {{${name}-note}} tail`
    equal(h.editor.save().blocks, expected)
    equal(h.state.transactions.map(event => [event.origin, event.action]), [['native-input', 'commit']])
    assert(h.panels.get('a').field().contentEditable === 'false' && h.panels.get('a').field().innerHTML === '', 'Healthy native commit reauthorized the failed sibling')
    equal(h.state.attempts.filter(item => item.kind === 'create' && item.label === 'a-back').length, 1, 'Unrelated native commit retried failed content')
  } finally { await closeComposition(h) }
})

for (const layoutMove of [false, true]) test(`trusted pending text survives sibling failure${layoutMove ? ' and a harmless owned wrapper move' : ''}`, async () => {
  const h = createPresentationNativeFixture({ layoutMove })
  try {
    await pause(20)
    const before = h.editor.save().blocks, note = h.panels.get('a').note, task = h.latest('a-note').context.beginTask(), fault = h.arm('create', 'a-back')
    note.focus(); window.getSelection().setBaseAndExtent(note.firstChild, 1, note.firstChild, 1)
    let trustedBefore = false, observation
    note.addEventListener('beforeinput', event => { trustedBefore = event.isTrusted }, { once: true })
    note.addEventListener('input', event => {
      const priorRange = range()
      h.panels.get('a').button('back').click()
      const beforeRefresh = { html: note.innerHTML, text: note.firstChild, range: range(), validLayout: sameRange(priorRange) }
      let error
      try { h.editor.blocks.focus('a', { fieldKey: 'note', offset: 2 }) } catch (caught) { error = caught }
      observation = { trusted: event.isTrusted, beforeRefresh, error, sameDOM: note.innerHTML === beforeRefresh.html && note.firstChild === beforeRefresh.text,
        sameRange: sameRange(beforeRefresh.range), canonical: h.editor.save().blocks, liveTask: !task.signal.aborted }
    }, { once: true })
    await window.__testInput('Input.insertText', { text: 'X' }); await pause(40)
    assert(trustedBefore && observation?.trusted && observation.beforeRefresh.validLayout, 'Precondition: trusted pending input and exact pre-refresh range are required')
    assert(!observation.error || observation.error === fault, 'Presentation surfaced an unrelated failure')
    assert(observation.sameDOM && observation.sameRange && observation.liveTask, 'Presentation replaced pending native text, range or scope')
    equal(observation.canonical, before, 'Pending input was committed before its native owner')
    const expected = clone(before); expected[0].data.note = 'NXote {{a-note}} tail'
    equal(h.editor.save().blocks, expected)
    equal(h.state.transactions.map(event => [event.origin, event.action]), [['native-input', 'commit']])
    assert(h.panels.get('a').field().contentEditable === 'false')
  } finally { h.dispose() }
})

for (const corruption of ['text', 'unsafe-attribute', 'forged-widget', 'synthetic-composition']) test(`unowned ${corruption} cannot borrow pending-native preservation`, async () => {
  const h = createPresentationNativeFixture()
  try {
    await pause(20)
    const before = h.editor.save().blocks, note = h.panels.get('a').note
    if (corruption === 'synthetic-composition') note.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    if (corruption === 'text' || corruption === 'synthetic-composition') note.firstChild.data += ' INJECTED '
    else if (corruption === 'unsafe-attribute') {
      const mark = document.createElement('b'); mark.setAttribute('onclick', 'window.__presentationUnsafeExecuted=true'); mark.textContent = 'INJECTED'; note.prepend(mark)
    } else {
      const fake = document.createElement('span'); fake.dataset.inlinePlugin = h.inline.type; fake.dataset.id = 'a-note'; fake.textContent = 'INJECTED'; note.append(fake)
    }
    h.panels.get('a').button('back').click(); await pause(30)
    assert(!note.innerHTML.includes('INJECTED') && !note.querySelector('[onclick]'), 'Unowned or unsafe DOM was retained')
    assert(h.latest('a-note').element.isConnected && note.contains(h.latest('a-note').element), 'Canonical owned widget was lost during repair')
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.state.transactions.length === 0)
  } finally { h.dispose() }
})

for (const unsafe of [false, true]) test(`${unsafe ? 'unsafe' : 'stale'} genuine composition does not authorize preservation`, async () => {
  const h = createPresentationNativeFixture()
  try {
    await pause(20)
    const note = h.panels.get('a').note
    await compose(note)
    if (unsafe) {
      const mark = document.createElement('b'); mark.setAttribute('onclick', 'window.__presentationUnsafeExecuted=true'); note.firstChild.replaceWith(mark); mark.append('Nにote ')
    } else h.editor.blocks.update('b', current => ({ data: { ...current.data, front: current.data.front + ' changed' } }))
    const before = h.editor.save().blocks, commits = h.state.transactions.length, undo = h.editor.canUndo
    h.panels.get('a').button('back').click(); await pause(30)
    assert(!note.textContent.includes('に') && !note.querySelector('[onclick]'), 'Stale or unsafe envelope retained arbitrary live DOM')
    equal(h.editor.save().blocks, before)
    equal(h.state.transactions.length, commits)
    equal(h.editor.canUndo, undo)
  } finally { await closeComposition(h) }
})

for (const fail of [false, true]) test(`presentation ${fail ? 'failure' : 'switch'} preserves an exact backward same-block range`, async () => {
  const h = createPresentationNativeFixture()
  try {
    await pause(20)
    const note = h.panels.get('a').note, before = h.editor.save().blocks
    note.focus(); window.getSelection().setBaseAndExtent(note.firstChild, 3, note.firstChild, 1)
    const selection = range()
    if (fail) h.arm('create', 'a-back')
    h.panels.get('a').button('back').click(); await pause(30)
    assert(sameRange(selection), 'Presentation replaced or collapsed an unaffected backward range')
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.state.transactions.length === 0)
  } finally { h.dispose() }
})

test('presentation failure preserves another editor exact selection and focus', async () => {
  const h = createPresentationNativeFixture(), foreign = make([para('foreign', 'Foreign selection')])
  try {
    await pause(20)
    const field = editableField(foreign), before = h.editor.save().blocks, foreignBefore = foreign.save().blocks
    field.focus(); window.getSelection().setBaseAndExtent(field.firstChild, 5, field.firstChild, 2)
    const selection = range()
    h.arm('create', 'a-back'); h.panels.get('a').button('back').click(); await pause(30)
    assert(sameRange(selection), 'Local presentation recovery moved another editor selection')
    equal(h.editor.save().blocks, before); equal(foreign.save().blocks, foreignBefore)
    assert(!h.editor.canUndo && !foreign.canUndo && h.state.transactions.length === 0)
  } finally { h.dispose() }
})
